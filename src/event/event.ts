/**
 * Fire DOM events
 */
import { ErrorCode, error } from '@passlock/shared/error'
import { Effect } from 'effect'

export const DebugMessage = 'PasslogDebugMessage'

export const fireEvent = (message: string) => {
  return Effect.try({
    try: () => {
      const evt = new CustomEvent(DebugMessage, { detail: message })
      globalThis.dispatchEvent(evt)
    },
    catch: () => {
      return error('Unable to fire custom event', ErrorCode.InternalBrowserError)
    },
  })
}

export function isPasslockEvent(event: Event): event is CustomEvent {
  if (event.type !== DebugMessage) return false
  return 'detail' in event
}
