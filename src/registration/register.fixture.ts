import {
  OptionsReq,
  OptionsRes,
  VerificationReq,
  VerificationRes,
} from '@passlock/shared/dist/rpc/registration.js'
import { RpcClient } from '@passlock/shared/dist/rpc/rpc.js'
import type { RegistrationCredential } from '@passlock/shared/dist/schema/schema.js'
import { Effect as E, Layer as L } from 'effect'
import { CreateCredential, type RegistrationRequest } from './register.js'
import * as Fixtures from '../test/fixtures.js'
import { UserService } from '../user/user.js'
import { PreConnectRes } from '@passlock/shared/dist/rpc/connection.js'

export const session = 'session'
export const token = 'token'
export const code = 'code'
export const authType = 'passkey'
export const expireAt = Date.now() + 10000

export const registrationRequest: RegistrationRequest = {
  email: 'jdoe@gmail.com',
  givenName: 'john',
  familyName: 'doe',
}

export const optionsReq = new OptionsReq(registrationRequest)

export const registrationOptions: OptionsRes = {
  session,
  publicKey: {
    rp: {
      name: 'passlock',
      id: 'passlock.dev',
    },
    user: {
      name: 'john doe',
      id: 'jdoe',
      displayName: 'john doe',
    },
    challenge: 'FKZSl_saKu5OXjLLwoq8eK3wlD8XgpGiS10SszW5RiE',
    pubKeyCredParams: [],
  },
}

export const optionsRes = new OptionsRes(registrationOptions)

export const credential: RegistrationCredential = {
  type: 'public-key',
  id: '1',
  rawId: '1',
  response: {
    transports: [],
    clientDataJSON: '',
    attestationObject: '',
  },
  clientExtensionResults: {},
}

export const verificationReq = new VerificationReq({ session, credential })

export const verificationRes = new VerificationRes({ principal: Fixtures.principal })

export const createCredentialTest = L.succeed(
  CreateCredential,
  CreateCredential.of(() => E.succeed(credential)),
)

export const userServiceTest = L.succeed(
  UserService,
  UserService.of({
    isExistingUser: () => E.succeed(false),
  }),
)

export const rpcClientTest = L.succeed(
  RpcClient,
  RpcClient.of({
    preConnect: () => E.succeed(new PreConnectRes({ warmed: true })),
    isExistingUser: () => E.fail(Fixtures.notImplemented),
    verifyEmail: () => E.fail(Fixtures.notImplemented),
    getRegistrationOptions: () => E.succeed(optionsRes),
    verifyRegistrationCredential: () => E.succeed(verificationRes),
    getAuthenticationOptions: () => E.fail(Fixtures.notImplemented),
    verifyAuthenticationCredential: () => E.fail(Fixtures.notImplemented),
    verifyIdToken: () => E.fail(Fixtures.notImplemented)
  }),
)

export const principal = Fixtures.principal

export const capabilitiesTest = Fixtures.capabilitiesTest

export const storageServiceTest = Fixtures.storageServiceTest
