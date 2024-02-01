import { Input } from "valibot"
import type { RegistrationPublicKeyCredential } from '@github/webauthn-json/browser-ponyfill'
import type { PasslockError } from '@passlock/shared/error'
import type { PasslockLogger } from '@passlock/shared/logging'
import type { Principal } from '@passlock/shared/schema'
import { Effect as E, Layer } from 'effect'
import { vi } from 'vitest'

import { Create, type RegistrationRequest } from './register'
import { registrationOptions } from './register.fixture.json'
import { Abort, Endpoint, Tenancy } from '../config'
import { runUnion } from '../exit'
import { NetworkService } from '../network/network'
import { type GetData, type PostData, noopLogger } from '../test/testUtils'
import { Capabilities } from '../utils'

const encoder = new TextEncoder()
const rawId = encoder.encode('1')

export const tenancyId = 'testTenancy'
export const clientId = 'clientId'
export const endpoint = 'https://example.com'

export const request: RegistrationRequest = {
  email: 'john.doe@gmail.com',
  firstName: 'john',
  lastName: 'doe',
  userVerification: 'preferred',
}

export const encodedEmail = encodeURIComponent(request.email)

export const credential: RegistrationPublicKeyCredential = {
  authenticatorAttachment: null,
  rawId: rawId,
  response: {
    clientDataJSON: encoder.encode('json'),
  },
  getClientExtensionResults: () => {
    throw new Error('Function not implemented.')
  },
  id: '1',
  type: 'public-key',
  toJSON: () => {
    throw new Error('Function not implemented.')
  },
}

// Frontend receives dates as objects
export const expectedPrincipal: Principal = {
  token: 'token',
  subject: {
    id: '1',
    email: 'john.doe@gmail.com',
    firstName: 'john',
    lastName: 'doe',
    emailVerified: false,
  },
  authStatement: {
    authType: 'email',
    userVerified: false,
    authTimestamp: new Date(0),
  },
  expiresAt: new Date(0),
}

// Backend sends dates as strings
const principal: Input<typeof Principal> = {
  ...expectedPrincipal,
  authStatement: {
    ...expectedPrincipal.authStatement,
    authTimestamp: expectedPrincipal.authStatement.authTimestamp.toISOString(),
  },
  expiresAt: expectedPrincipal.expiresAt.toISOString(),
}

export const buildMocks = (registered: boolean) => {
  const getData: GetData = vi.fn().mockImplementationOnce(() => E.succeed({ registered }))

  const postData: PostData = vi
    .fn()
    .mockImplementationOnce(() => E.succeed(registrationOptions))
    .mockImplementationOnce(() => E.succeed(principal))

  return { getData, postData }
}

export type In<O> = E.Effect<
  Tenancy | Endpoint | Abort | Capabilities | NetworkService | Create | PasslockLogger,
  PasslockError,
  O
>
export type Out<O> = Promise<{
  result: PasslockError | O
  getData: GetData
  postData: PostData
}>

export const buildTestLayers = (registered: boolean) => {
  const { getData, postData } = buildMocks(registered)
  const tenancyTest = Layer.succeed(Tenancy, Tenancy.of({ tenancyId, clientId }))
  const endpointTest = Layer.succeed(Endpoint, Endpoint.of({ endpoint }))
  const abortTest = Layer.succeed(Abort, Abort.of({}))
  const capabilitiesTest = Layer.succeed(
    Capabilities,
    Capabilities.of({ passkeysSupported: E.unit }),
  )

  const create: Create = () => Promise.resolve(credential)
  const createTest = Layer.succeed(Create, Create.of(create))
  const networkServiceLayer = Layer.succeed(
    NetworkService,
    NetworkService.of({ getData, postData }),
  )

  const layers = Layer.mergeAll(
    tenancyTest,
    endpointTest,
    abortTest,
    capabilitiesTest,
    networkServiceLayer,
    createTest,
    noopLogger,
  )

  return { layers, getData, postData }
}

export async function runEffect<O>(effect: In<O>, registered: boolean): Out<O> {
  const { layers, getData, postData } = buildTestLayers(registered)
  const noRequirements = E.provide(effect, layers)
  const result = await runUnion(noRequirements)

  return { result, getData, postData }
}
