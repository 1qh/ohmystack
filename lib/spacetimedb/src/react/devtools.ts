'use client'
import type {
  DevCacheEntry as SharedDevCacheEntry,
  DevError as SharedDevError,
  DevMutation as SharedDevMutation,
  DevSubscription as SharedDevSubscription
} from '@a/shared/react/devtools'
import { createDevtoolsCore, SLOW_THRESHOLD_MS, STALE_THRESHOLD_MS } from '@a/shared/react/devtools'
import { useSpacetimeDB } from 'spacetimedb/react'
import type { ErrorData } from '../server/helpers'
import type { ErrorCode } from '../server/types'
import { extractErrorData, getErrorDetail, getErrorMessage } from '../server/helpers'

interface DevConnection {
  connectionError: string
  connectionId: string
  hasConnection: boolean
  identity: string
  isActive: boolean
  token: string
}

type DevCacheEntry = SharedDevCacheEntry
interface DevError extends SharedDevError {
  data?: ErrorData
}
type DevMutation = SharedDevMutation
type DevSubscription = SharedDevSubscription

const toDisplay = (value: unknown): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
    if (typeof value === 'object' && 'toHexString' in value) {
      const obj = value as { toHexString?: () => string }
      if (typeof obj.toHexString === 'function') return obj.toHexString()
    }
    if (typeof value === 'object')
      try {
        return JSON.stringify(value)
      } catch {
        return Object.prototype.toString.call(value)
      }
    return ''
  },
  core = createDevtoolsCore({ extractErrorData, getErrorDetail, getErrorMessage }),
  clearErrors = core.clearErrors,
  clearMutations = core.clearMutations,
  completeMutation = core.completeMutation,
  completeReducerCall = core.completeMutation,
  pushError = core.pushError,
  trackCacheAccess = core.trackCacheAccess,
  trackMutation = core.trackMutation,
  trackReducerCall = core.trackMutation,
  trackSubscription = core.trackSubscription,
  untrackSubscription = core.untrackSubscription,
  updateSubscription = core.updateSubscription,
  updateSubscriptionData = core.updateSubscriptionData,
  injectError = (code: ErrorCode, opts?: { detail?: string; message?: string; op?: string; table?: string }) => {
    const data: ErrorData = { code, ...opts }
    pushError({ data, detail: opts?.detail ?? `Injected error: ${code}`, message: opts?.message ?? code })
  },
  useDevErrors = () => {
    const spacetime = useSpacetimeDB(),
      { connectionError, connectionId, identity, isActive, token } = spacetime
    const connection: DevConnection = {
      connectionError: connectionError ? getErrorMessage(connectionError) : '',
      connectionId: toDisplay(connectionId),
      hasConnection: Boolean(spacetime.getConnection()),
      identity: toDisplay(identity),
      isActive,
      token: token ?? ''
    }
    return core.useDevStore({
      deps: [connection.connectionError, connection.connectionId, connection.identity, connection.isActive, connection.token],
      extra: () => ({ connection })
    }) as {
      cache: DevCacheEntry[]
      clear: () => void
      clearMutations: () => void
      connection: DevConnection
      errors: DevError[]
      mutations: DevMutation[]
      push: (e: unknown) => void
      subscriptions: DevSubscription[]
    }
  }

export type { DevCacheEntry, DevConnection, DevError, DevMutation, DevSubscription }
export {
  clearErrors,
  clearMutations,
  completeMutation,
  completeReducerCall,
  injectError,
  pushError,
  SLOW_THRESHOLD_MS,
  STALE_THRESHOLD_MS,
  trackCacheAccess,
  trackMutation,
  trackReducerCall,
  trackSubscription,
  untrackSubscription,
  updateSubscription,
  updateSubscriptionData,
  useDevErrors
}
