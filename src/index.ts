import type {
  BadRequest,
  Disabled,
  Duplicate,
  Forbidden,
  NotFound,
  NotSupported,
  Unauthorized,
} from '@passlock/shared/dist/error/error.js'

import type { Principal } from '@passlock/shared/dist/schema/schema.js'
import { ErrorCode } from '@passlock/shared/dist/error/error.js'
import { RpcConfig } from '@passlock/shared/dist/rpc/rpc.js'
import { Effect as E, Layer as L, Layer, Option, Runtime, Scope, pipe } from 'effect'
import { type AuthenticationRequest, AuthenticationService } from './authentication/authenticate.js'
import { Capabilities } from './capabilities/capabilities.js'
import { ConnectionService } from './connection/connection.js'
import { allRequirements } from './effect.js'
import { EmailService, type VerifyRequest } from './email/email.js'
import { type RegistrationRequest, RegistrationService } from './registration/register.js'
import { type AuthType, Storage, StorageService, type StoredToken } from './storage/storage.js'
import { type Email, UserService } from './user/user.js'

/* Exports */

export type Options = { signal?: AbortSignal }
export type { Email } from './user/user.js' 
export type { UserVerification, VerifyEmail } from '@passlock/shared/dist/schema/schema.js'
export type { RegistrationRequest } from './registration/register.js'
export type { AuthenticationRequest } from './authentication/authenticate.js'
export type { VerifyRequest } from './email/email.js'
export type { AuthType, StoredToken } from './storage/storage.js'
export type { Principal } from '@passlock/shared/dist/schema/schema.js'

export { ErrorCode } from '@passlock/shared/dist/error/error.js'

export class PasslockError extends Error {
  readonly _tag = 'PasslockError'
  readonly code: ErrorCode

  constructor(message: string, code: ErrorCode) {
    super(message)
    this.code = code
  }

  static readonly isError = (error: unknown): error is PasslockError => {
    return (
      typeof error === 'object' &&
      error !== null &&
      '_tag' in error &&
      error['_tag'] === 'PasslockError'
    )
  }
}

/* // Exports */

type PasslockErrors =
  | BadRequest
  | NotSupported
  | Duplicate
  | Unauthorized
  | Forbidden
  | Disabled
  | NotFound

const hasMessage = (defect: unknown): defect is { message: string } => {
  return (
    typeof defect === 'object' &&
    defect !== null &&
    'message' in defect &&
    typeof defect['message'] === 'string'
  )
}

const transformErrors = <A, R>(
  effect: E.Effect<A, PasslockErrors, R>,
): E.Effect<A | PasslockError, never, R> => {
  const withErrorHandling = E.catchTags(effect, {
    NotSupported: e => E.succeed(new PasslockError(e.message, ErrorCode.NotSupported)),
    BadRequest: e => E.succeed(new PasslockError(e.message, ErrorCode.BadRequest)),
    Duplicate: e => E.succeed(new PasslockError(e.message, ErrorCode.Duplicate)),
    Unauthorized: e => E.succeed(new PasslockError(e.message, ErrorCode.Unauthorized)),
    Forbidden: e => E.succeed(new PasslockError(e.message, ErrorCode.Forbidden)),
    Disabled: e => E.succeed(new PasslockError(e.message, ErrorCode.Disabled)),
    NotFound: e => E.succeed(new PasslockError(e.message, ErrorCode.NotFound)),
  })

  const sandboxed = E.sandbox(withErrorHandling)

  const withSandboxing = E.catchTags(sandboxed, {
    Die: ({ defect }) => {
      return hasMessage(defect)
        ? E.succeed(new PasslockError(defect.message, ErrorCode.InternalServerError))
        : E.succeed(new PasslockError('Sorry, something went wrong', ErrorCode.InternalServerError))
    },

    Interrupt: () => {
      return E.succeed(new PasslockError('Operation aborted', ErrorCode.InternalBrowserError))
    },

    Sequential: errors => {
      console.error(errors)
      return E.succeed(
        new PasslockError('Sorry, something went wrong', ErrorCode.InternalServerError),
      )
    },

    Parallel: errors => {
      console.error(errors)
      return E.succeed(
        new PasslockError('Sorry, something went wrong', ErrorCode.InternalServerError),
      )
    },
  })

  return E.unsandbox(withSandboxing)
}

type Requirements =
  | UserService
  | RegistrationService
  | AuthenticationService
  | ConnectionService
  | EmailService
  | StorageService
  | Capabilities

export class PasslockUnsafe {
  private readonly runtime: Runtime.Runtime<Requirements>

  constructor(config: { tenancyId: string; clientId: string; endpoint?: string }) {
    const rpcConfig = Layer.succeed(RpcConfig, RpcConfig.of(config))
    const storage = Layer.succeed(Storage, Storage.of(globalThis.localStorage))
    const allLayers = pipe(allRequirements, L.provide(rpcConfig), L.provide(storage))
    const scope = E.runSync(Scope.make())
    this.runtime = E.runSync(Layer.toRuntime(allLayers).pipe(Scope.extend(scope)))
  }

  private readonly runPromise = <A, R extends Requirements>(
    effect: E.Effect<A, PasslockErrors, R>,
    options: Options | undefined = undefined
  ) => {
    return pipe(
      transformErrors(effect),
      E.flatMap(result => (PasslockError.isError(result) ? E.fail(result) : E.succeed(result))),
      effect => Runtime.runPromise(this.runtime)(effect, options),
    )
  }

  preConnect = (options?: Options): Promise<void> =>
    pipe(
      ConnectionService,
      E.flatMap(service => service.preConnect()),
      effect => Runtime.runPromise(this.runtime)(effect, options),
    )

  isPasskeySupport = (): Promise<boolean> =>
    pipe(
      Capabilities,
      E.flatMap(service => service.isPasskeySupport),
      effect => Runtime.runPromise(this.runtime)(effect),
    )

  isExistingPasskey = (email: Email, options?: Options): Promise<boolean> =>
    pipe(
      UserService,
      E.flatMap(service => service.isExistingUser(email)),
      effect => this.runPromise(effect, options),
    )

  registerPasskey = (request: RegistrationRequest, options?: Options): Promise<Principal> =>
    pipe(
      RegistrationService,
      E.flatMap(service => service.registerPasskey(request)),
      effect => this.runPromise(effect, options),
    )

  authenticatePasskey = (request: AuthenticationRequest, options?: Options): Promise<Principal> =>
    pipe(
      AuthenticationService,
      E.flatMap(service => service.authenticatePasskey(request)),
      effect => this.runPromise(effect, options),
    )

  verifyEmailCode = (request: VerifyRequest, options?: Options): Promise<Principal> =>
    pipe(
      EmailService,
      E.flatMap(service => service.verifyEmailCode(request)),
      effect => this.runPromise(effect, options),
    )

  verifyEmailLink = (options?: Options): Promise<Principal> =>
    pipe(
      EmailService,
      E.flatMap(service => service.verifyEmailLink()),
      effect => this.runPromise(effect, options),
    )

  getSessionToken = (authType: AuthType): StoredToken | undefined =>
    pipe(
      StorageService,
      E.flatMap(service => service.getToken(authType).pipe(effect => E.option(effect))),
      E.map(Option.getOrUndefined),
      effect => Runtime.runSync(this.runtime)(effect),
    )

  clearExpiredTokens = (): void =>
    pipe(
      StorageService,
      E.flatMap(service => service.clearExpiredTokens),
      effect => Runtime.runSync(this.runtime)(effect),
    )
}

export class Passlock {
  private readonly runtime: Runtime.Runtime<Requirements>

  constructor(config: { tenancyId: string; clientId: string; endpoint?: string }) {
    const rpcConfig = Layer.succeed(RpcConfig, RpcConfig.of(config))
    const storage = Layer.succeed(Storage, Storage.of(globalThis.localStorage))
    const allLayers = pipe(allRequirements, L.provide(rpcConfig), L.provide(storage))
    const scope = E.runSync(Scope.make())
    this.runtime = E.runSync(Layer.toRuntime(allLayers).pipe(Scope.extend(scope)))
  }

  private readonly runPromise = <A, R extends Requirements>(
    effect: E.Effect<A, PasslockErrors, R>,
    options: Options | undefined = undefined
  ) => {
    return pipe(
      transformErrors(effect), 
      effect => Runtime.runPromise(this.runtime)(effect, options)
    )
  }

  preConnect = (options?: Options): Promise<void | PasslockError> =>
    pipe(
      ConnectionService,
      E.flatMap(service => service.preConnect()),
      effect => this.runPromise(effect, options),
    )

  isPasskeySupport = (): Promise<boolean> =>
    pipe(
      Capabilities,
      E.flatMap(service => service.isPasskeySupport),
      effect => Runtime.runPromise(this.runtime)(effect),
    )

  isExistingPasskey = (email: Email, options?: Options): Promise<boolean | PasslockError> =>
    pipe(
      UserService,
      E.flatMap(service => service.isExistingUser(email)),
      effect => this.runPromise(effect, options),
    )

  registerPasskey = (request: RegistrationRequest, options?: Options): Promise<Principal | PasslockError> =>
    pipe(
      RegistrationService,
      E.flatMap(service => service.registerPasskey(request)),
      effect => this.runPromise(effect, options),
    )

  authenticatePasskey = (request: AuthenticationRequest = {}, options?: Options): Promise<Principal | PasslockError> =>
    pipe(
      AuthenticationService,
      E.flatMap(service => service.authenticatePasskey(request)),
      effect => this.runPromise(effect, options),
    )

  verifyEmailCode = (request: VerifyRequest, options?: Options): Promise<Principal | PasslockError> =>
    pipe(
      EmailService,
      E.flatMap(service => service.verifyEmailCode(request)),
      effect => this.runPromise(effect, options),
    )

  verifyEmailLink = (options?: Options): Promise<Principal | PasslockError> =>
    pipe(
      EmailService,
      E.flatMap(service => service.verifyEmailLink()),
      effect => this.runPromise(effect, options),
    )

  getSessionToken = (authType: AuthType): StoredToken | undefined =>
    pipe(
      StorageService,
      E.flatMap(service => service.getToken(authType).pipe(effect => E.option(effect))),
      E.map(maybeToken => Option.getOrUndefined(maybeToken)),
      effect => Runtime.runSync(this.runtime)(effect),
    )

  clearExpiredTokens = (): void =>
    pipe(
      StorageService,
      E.flatMap(service => service.clearExpiredTokens),
      effect => Runtime.runSync(this.runtime)(effect),
    )
}
