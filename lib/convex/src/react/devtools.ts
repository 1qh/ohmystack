'use client'
import { useEffect, useMemo, useState } from 'react'

import type { ConvexErrorData } from '../server/helpers'

import { extractErrorData, getErrorDetail, getErrorMessage } from '../server/helpers'

/** Tracks cache entry access statistics for the devtools panel. */
interface DevCacheEntry {
  hitCount: number
  id: number
  key: string
  lastAccess: number
  missCount: number
  stale: boolean
  table: string
}

/** Represents a captured error in the devtools error log. */
interface DevError {
  data?: ConvexErrorData
  detail: string
  id: number
  message: string
  timestamp: number
}

/** Tracks a mutation's lifecycle (pending → success/error) in devtools. */
interface DevMutation {
  args: string
  durationMs: number
  endedAt: number
  id: number
  name: string
  startedAt: number
  status: 'error' | 'pending' | 'success'
}

/** Tracks a real-time subscription's lifecycle and latency in devtools. */
interface DevSubscription {
  args: string
  dataPreview: string
  firstResultAt: number
  id: number
  lastUpdate: number
  latencyMs: number
  query: string
  renderCount: number
  resultCount: number
  startedAt: number
  status: 'error' | 'loaded' | 'loading'
  updateCount: number
}

const MAX_ERRORS = 50,
  MAX_MUTATIONS = 100,
  /** Threshold in ms above which a subscription is considered slow. */
  SLOW_THRESHOLD_MS = 5000,
  /** Threshold in ms above which a loaded subscription without updates is considered stale. */
  STALE_THRESHOLD_MS = 30_000,
  errorStore: DevError[] = [],
  mutationStore: DevMutation[] = [],
  cacheStore = new Map<string, DevCacheEntry>(),
  subStore = new Map<number, DevSubscription>()

let nextId = 1,
  listeners: (() => void)[] = []

const notify = () => {
    for (const fn of listeners) fn()
  },
  /** Records an error in the devtools error store. */
  pushError = (e: unknown) => {
    const data = extractErrorData(e),
      entry: DevError = {
        data,
        detail: getErrorDetail(e),
        id: nextId,
        message: getErrorMessage(e),
        timestamp: Date.now()
      }
    nextId += 1
    errorStore.unshift(entry)
    if (errorStore.length > MAX_ERRORS) errorStore.length = MAX_ERRORS
    notify()
  },
  /** Clears all errors from the devtools error store. */
  clearErrors = () => {
    errorStore.length = 0
    notify()
  },
  /** Begins tracking a subscription in devtools, returns its tracking ID. */
  trackSubscription = (query: string, args?: Record<string, unknown>): number => {
    const id = nextId
    nextId += 1
    subStore.set(id, {
      args: args ? JSON.stringify(args) : '{}',
      dataPreview: '',
      firstResultAt: 0,
      id,
      lastUpdate: 0,
      latencyMs: 0,
      query,
      renderCount: 0,
      resultCount: 0,
      startedAt: Date.now(),
      status: 'loading',
      updateCount: 0
    })
    notify()
    return id
  },
  /** Updates the status of a tracked subscription. */
  updateSubscription = (id: number, status: 'error' | 'loaded' | 'loading') => {
    const sub = subStore.get(id)
    if (!sub) return
    const now = Date.now()
    if (sub.firstResultAt === 0 && status === 'loaded') {
      sub.firstResultAt = now
      sub.latencyMs = now - sub.startedAt
    }
    sub.status = status
    sub.lastUpdate = now
    sub.updateCount += 1
    notify()
  },
  /** Removes a subscription from devtools tracking. */
  untrackSubscription = (id: number) => {
    subStore.delete(id)
    notify()
  },
  /** Updates the data preview for a tracked subscription. */
  updateSubscriptionData = (id: number, data: unknown[], preview: string) => {
    const sub = subStore.get(id)
    if (!sub) return
    sub.dataPreview = preview
    sub.resultCount = data.length
    sub.renderCount += 1
    notify()
  },
  /** Begins tracking a mutation in devtools, returns its tracking ID. */
  trackMutation = (name: string, args?: Record<string, unknown>): number => {
    const id = nextId
    nextId += 1
    mutationStore.unshift({
      args: args ? JSON.stringify(args) : '{}',
      durationMs: 0,
      endedAt: 0,
      id,
      name,
      startedAt: Date.now(),
      status: 'pending'
    })
    if (mutationStore.length > MAX_MUTATIONS) mutationStore.length = MAX_MUTATIONS
    notify()
    return id
  },
  /** Marks a tracked mutation as completed with the given status. */
  completeMutation = (id: number, status: 'error' | 'success') => {
    const entry = mutationStore.find(m => m.id === id)
    if (!entry) return
    entry.status = status
    entry.endedAt = Date.now()
    entry.durationMs = entry.endedAt - entry.startedAt
    notify()
  },
  getOrCreateCacheEntry = (table: string, key: string) => {
    const cacheKey = `${table}:${key}`
    let entry = cacheStore.get(cacheKey)
    if (!entry) {
      const id = nextId
      nextId += 1
      entry = { hitCount: 0, id, key, lastAccess: 0, missCount: 0, stale: false, table }
      cacheStore.set(cacheKey, entry)
    }
    return entry
  },
  /** Records a cache hit or miss for a table/key pair in devtools. */
  trackCacheAccess = (opts: { hit: boolean; key: string; stale?: boolean; table: string }) => {
    const entry = getOrCreateCacheEntry(opts.table, opts.key)
    entry.lastAccess = Date.now()
    if (opts.hit) entry.hitCount += 1
    else entry.missCount += 1
    if (opts.stale !== undefined) entry.stale = opts.stale
    notify()
  },
  /** Clears all tracked mutations from the devtools store. */
  clearMutations = () => {
    mutationStore.length = 0
    notify()
  },
  /** Subscribes to devtools state and returns current errors, mutations, subscriptions, and cache entries. */
  useDevErrors = () => {
    // eslint-disable-next-line react/hook-use-state
    const [, setTick] = useState(0)
    useEffect(() => {
      const fn = () => setTick(t => t + 1)
      listeners.push(fn)
      return () => {
        listeners = listeners.filter(l => l !== fn)
      }
      // biome-ignore lint/correctness/useExhaustiveDependencies: subscribe once
    }, [])
    // biome-ignore lint/correctness/useExhaustiveDependencies: derived from mutable module stores
    return useMemo(
      () => ({
        cache: [...cacheStore.values()],
        clear: clearErrors,
        clearMutations,
        errors: [...errorStore],
        mutations: [...mutationStore],
        push: pushError,
        subscriptions: [...subStore.values()]
      }),

      []
    )
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
