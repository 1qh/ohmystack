'use client'
import type {
  DevCacheEntry as SharedDevCacheEntry,
  DevError as SharedDevError,
  DevMutation as SharedDevMutation,
  DevSubscription as SharedDevSubscription
} from '@noboil/shared/react/devtools'
import { createDevtoolsCore, SLOW_THRESHOLD_MS, STALE_THRESHOLD_MS } from '@noboil/shared/react/devtools'
import type { ErrorData } from '../server/helpers'
import { extractErrorData, getErrorDetail, getErrorMessage } from '../server/helpers'
type DevCacheEntry = SharedDevCacheEntry
interface DevError extends SharedDevError {
  data?: ErrorData
}
type DevMutation = SharedDevMutation
type DevSubscription = SharedDevSubscription
const core = createDevtoolsCore({ extractErrorData, getErrorDetail, getErrorMessage })
const { clearErrors } = core
const { clearMutations } = core
const { completeMutation } = core
const { pushError } = core
const { trackCacheAccess } = core
const { trackMutation } = core
const { trackSubscription } = core
const { untrackSubscription } = core
const { updateSubscription } = core
const { updateSubscriptionData } = core
const useDevErrors = () =>
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
