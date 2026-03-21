'use client'
import type {
  DevCacheEntry as SharedDevCacheEntry,
  DevError as SharedDevError,
  DevMutation as SharedDevMutation,
  DevSubscription as SharedDevSubscription
} from '@a/shared/react/devtools'
import { createDevtoolsCore, SLOW_THRESHOLD_MS, STALE_THRESHOLD_MS } from '@a/shared/react/devtools'
import type { ConvexErrorData } from '../server/helpers'
import { extractErrorData, getErrorDetail, getErrorMessage } from '../server/helpers'

type DevCacheEntry = SharedDevCacheEntry
interface DevError extends SharedDevError {
  data?: ConvexErrorData
}
type DevMutation = SharedDevMutation
type DevSubscription = SharedDevSubscription

const core = createDevtoolsCore({ extractErrorData, getErrorDetail, getErrorMessage }),
  clearErrors = core.clearErrors,
  clearMutations = core.clearMutations,
  completeMutation = core.completeMutation,
  pushError = core.pushError,
  trackCacheAccess = core.trackCacheAccess,
  trackMutation = core.trackMutation,
  trackSubscription = core.trackSubscription,
  untrackSubscription = core.untrackSubscription,
  updateSubscription = core.updateSubscription,
  updateSubscriptionData = core.updateSubscriptionData,
  useDevErrors = () =>
    core.useDevStore({ deps: [], extra: () => ({}) }) as {
      cache: DevCacheEntry[]
      clear: () => void
      clearMutations: () => void
      errors: DevError[]
      mutations: DevMutation[]
      push: (e: unknown) => void
      subscriptions: DevSubscription[]
    }

export type { DevCacheEntry, DevError, DevMutation, DevSubscription }
export {
  clearErrors,
  clearMutations,
  completeMutation,
  pushError,
  SLOW_THRESHOLD_MS,
  STALE_THRESHOLD_MS,
  trackCacheAccess,
  trackMutation,
  trackSubscription,
  untrackSubscription,
  updateSubscription,
  updateSubscriptionData,
  useDevErrors
}
