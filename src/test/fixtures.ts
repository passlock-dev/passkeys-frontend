import type { Principal } from '@passlock/shared/dist/schema/schema.js'
import { Effect as E, Layer as L } from 'effect'
import { Capabilities } from '../capabilities/capabilities.js'
import { StorageService, type StoredToken } from '../storage/storage.js'
import { BadRequest } from '@passlock/shared/dist/error/error.js'
import { PreConnectRes } from '@passlock/shared/dist/rpc/connection.js'

export const session = 'session'
export const token = 'token'
export const code = 'code'
export const authType = 'passkey'
export const expireAt = Date.now() + 10000

export const principal: Principal = {
  token: 'token',
  user: {
    id: '1',
    email: 'john.doe@gmail.com',
    givenName: 'john',
    familyName: 'doe',
    emailVerified: false,
  },
  socials: {

  },
  authStatement: {
    authType: 'email',
    userVerified: false,
    authTimestamp: new Date(0),
  },
  expireAt: new Date(0),
}

export const capabilitiesTest = L.succeed(
  Capabilities,
  Capabilities.of({
    passkeySupport: E.unit,
    isPasskeySupport: E.succeed(true),
    autofillSupport: E.unit,
    isAutofillSupport: E.succeed(true),
  }),
)

export const storedToken: StoredToken = { token, authType, expireAt }

export const storageServiceTest = L.succeed(
  StorageService,
  StorageService.of({
    storeToken: () => E.unit,
    getToken: () => E.succeed(storedToken),
    clearToken: () => E.unit,
    clearExpiredToken: () => E.unit,
    clearExpiredTokens: E.unit,
  }),
)

export const preConnectRes = new PreConnectRes({ warmed: true })
export const notImplemented = new BadRequest({ message: 'Not implemented' })