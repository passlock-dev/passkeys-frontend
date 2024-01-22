import { ErrorCode, PasslockError } from '@passlock/shared/error'
import { Effect } from 'effect'
import { describe, expect, test } from 'vitest'

import { fireEvent } from './event'

// @vitest-environment node

describe('isPasslockEvent', () => {
  test("return a Passlock error if custom events aren't supported", () => {
    const effect = fireEvent('hello world')

    const sideEffect = () => {
      Effect.runSync(effect)
    }

    expect(sideEffect).toThrowError(
      new PasslockError({
        message: 'Unable to fire custom event',
        code: ErrorCode.InternalBrowserError,
      }),
    )
  })
})