/**
 * Passkey authentication effects
 */
import {
  type CredentialRequestOptionsJSON,
  parseRequestOptionsFromJSON,
} from '@github/webauthn-json/browser-ponyfill'
import {
  type BadRequest,
  InternalBrowserError,
  type NotSupported,
} from '@passlock/shared/dist/error/error'
import type { VerificationErrors } from '@passlock/shared/dist/rpc/authentication'
import { OptionsReq, VerificationReq } from '@passlock/shared/dist/rpc/authentication'
import { RpcClient } from '@passlock/shared/dist/rpc/rpc'
import type {
  AuthenticationCredential,
  Principal,
  UserVerification,
} from '@passlock/shared/dist/schema/schema'
import { Context, Effect as E, Layer, flow, pipe } from 'effect'
import { Capabilities } from '../capabilities/capabilities'
import { StorageService } from '../storage/storage'

/* Requests */

export type AuthenticationRequest = { userVerification?: UserVerification }

/* Errors */

export type AuthenticationErrors = NotSupported | BadRequest | VerificationErrors

/* Dependencies */

export type GetCredential = (
  options: CredentialRequestOptions,
) => E.Effect<AuthenticationCredential, InternalBrowserError>
export const GetCredential = Context.GenericTag<GetCredential>('@services/Get')

/* Service */

export type AuthenticationService = {
  authenticatePasskey: (data: AuthenticationRequest) => E.Effect<Principal, AuthenticationErrors>
}

export const AuthenticationService = Context.GenericTag<AuthenticationService>(
  '@services/AuthenticationService',
)

/* Utilities */

const fetchOptions = (req: OptionsReq) => {
  return E.gen(function* (_) {
    yield* _(E.logDebug('Making request'))

    const rpcClient = yield* _(RpcClient)
    const { publicKey, session } = yield* _(rpcClient.getAuthenticationOptions(req))

    yield* _(E.logDebug('Converting Passlock options to CredentialRequestOptions'))
    const options = yield* _(toRequestOptions({ publicKey }))

    return { options, session }
  })
}

const toRequestOptions = (options: CredentialRequestOptionsJSON) => {
  return pipe(
    E.try(() => parseRequestOptionsFromJSON(options)),
    E.mapError(
      error =>
        new InternalBrowserError({
          message: 'Browser was unable to create credential request options',
          detail: String(error.error),
        }),
    ),
  )
}

const verifyCredential = (req: VerificationReq) => {
  return E.gen(function* (_) {
    yield* _(E.logDebug('Making request'))

    const rpcClient = yield* _(RpcClient)
    const { principal } = yield* _(rpcClient.verifyAuthenticationCredential(req))

    return principal
  })
}

/* Effects */

type Dependencies = GetCredential | Capabilities | StorageService | RpcClient

export const authenticatePasskey = (
  request: AuthenticationRequest,
): E.Effect<Principal, AuthenticationErrors, Dependencies> => {
  const effect = E.gen(function* (_) {
    yield* _(E.logInfo('Checking if browser supports Passkeys'))
    const capabilities = yield* _(Capabilities)
    yield* _(capabilities.passkeySupport)

    yield* _(E.logInfo('Fetching authentication options from Passlock'))
    const { options, session } = yield* _(fetchOptions(new OptionsReq(request)))

    yield* _(E.logInfo('Looking up credential'))
    const get = yield* _(GetCredential)
    const credential = yield* _(get(options))

    yield* _(E.logInfo('Verifying credential with Passlock'))
    const principal = yield* _(verifyCredential(new VerificationReq({ credential, session })))

    const storageService = yield* _(StorageService)
    yield* _(storageService.storeToken(principal))
    yield* _(E.logDebug('Stored token in local storage'))

    yield* _(E.logDebug('Defering local token deletion'))
    const delayedClearTokenE = pipe(
      storageService.clearExpiredToken('passkey'),
      E.delay('6 minutes'),
      E.fork,
    )
    yield* _(delayedClearTokenE)

    return principal
  })

  return E.catchTag(effect, 'InternalBrowserError', e => E.die(e))
}

/* Live */

/* v8 ignore start */
export const AuthenticateServiceLive = Layer.effect(
  AuthenticationService,
  E.gen(function* (_) {
    const context = yield* _(E.context<GetCredential | RpcClient | Capabilities | StorageService>())

    return AuthenticationService.of({
      authenticatePasskey: flow(authenticatePasskey, E.provide(context)),
    })
  }),
)
/* v8 ignore stop */
