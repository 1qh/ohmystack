'use client'
import { useEffect, useMemo, useState } from 'react'

import type { ConvexErrorData } from '../server/helpers'

import { extractErrorData, getErrorDetail, getErrorMessage } from '../server/helpers'

interface DevError {
  data?: ConvexErrorData
  detail: string
  id: number
  message: string
  timestamp: number
}

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
  clearErrors = () => {
    errorStore.length = 0
    notify()
  },
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
  updateSubscriptionData = (id: number, data: unknown[], preview: string) => {
    const sub = subStore.get(id)
    if (!sub) return
    sub.dataPreview = preview
    sub.resultCount = data.length
    sub.renderCount += 1
    notify()
  },
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
  clearMutations = () => {
    mutationStore.length = 0
    notify()
  },
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
