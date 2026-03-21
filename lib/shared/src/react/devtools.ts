'use client'
import { useEffect, useReducer } from 'react'
interface CreateDevtoolsCoreOptions {
  extractErrorData: (error: unknown) => unknown
  getErrorDetail: (error: unknown) => string
  getErrorMessage: (error: unknown) => string
}
interface DevCacheEntry {
  hitCount: number
  id: number
  key: string
  lastAccess: number
  missCount: number
  stale: boolean
  table: string
}
interface DevError {
  data?: unknown
  detail: string
  id: number
  message: string
  timestamp: number
}
interface DevMutation {
  args: string
  durationMs: number
  endedAt: number
  id: number
  name: string
  startedAt: number
  status: 'error' | 'pending' | 'success'
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
  SLOW_THRESHOLD_MS = 5000,
  STALE_THRESHOLD_MS = 30_000,
  createDevtoolsCore = ({ extractErrorData, getErrorDetail, getErrorMessage }: CreateDevtoolsCoreOptions) => {
    const errorStore: DevError[] = [],
      mutationStore: DevMutation[] = [],
      cacheStore = new Map<string, DevCacheEntry>(),
      subStore = new Map<number, DevSubscription>(),
      listeners: (() => void)[] = []
    let nextId = 1
    const notify = () => {
        for (const fn of listeners) fn()
      },
      pushError = (e: unknown) => {
        const entry: DevError = {
          data: extractErrorData(e),
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
      clearErrors = () => {
        errorStore.length = 0
        notify()
      },
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
      untrackSubscription = (id: number) => {
        subStore.delete(id)
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
      trackCacheAccess = (opts: { hit: boolean; key: string; stale?: boolean; table: string }) => {
        const entry = getOrCreateCacheEntry(opts.table, opts.key)
        entry.lastAccess = Date.now()
        if (opts.hit) entry.hitCount += 1
        else entry.missCount += 1
        if (opts.stale !== undefined) entry.stale = opts.stale
        notify()
      },
      clearMutations = () => {
        mutationStore.length = 0
        notify()
      },
      useDevStore = <TExtra extends object>({ extra }: { deps: unknown[]; extra: () => TExtra }) => {
        const [, bump] = useReducer((n: number) => n + 1, 0)
        useEffect(() => {
          const fn = () => bump()
          listeners.push(fn)
          return () => {
            const idx = listeners.indexOf(fn)
            if (idx !== -1) listeners.splice(idx, 1)
          }
        }, [])
        return {
          cache: [...cacheStore.values()],
          clear: clearErrors,
          clearMutations,
          errors: [...errorStore],
          mutations: [...mutationStore],
          push: pushError,
          subscriptions: [...subStore.values()],
          ...extra()
        }
      }
    return {
      clearErrors,
      clearMutations,
      completeMutation,
      pushError,
      trackCacheAccess,
      trackMutation,
      trackSubscription,
      untrackSubscription,
      updateSubscription,
      updateSubscriptionData,
      useDevStore
    }
  }
export { createDevtoolsCore, SLOW_THRESHOLD_MS, STALE_THRESHOLD_MS }
export type { DevCacheEntry, DevError, DevMutation, DevSubscription }
