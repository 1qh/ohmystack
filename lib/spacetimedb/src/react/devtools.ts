'use client'
import { useEffect, useMemo, useState } from 'react'
import { useSpacetimeDB } from 'spacetimedb/react'

import type { ErrorData } from '../server/helpers'
import type { ErrorCode } from '../server/types'

import { extractErrorData, getErrorDetail, getErrorMessage } from '../server/helpers'
interface DevCacheEntry {
  hitCount: number
  id: number
  key: string
  lastAccess: number
  missCount: number
  stale: boolean
  table: string
}
interface DevConnection {
  connectionError: string
  connectionId: string
  hasConnection: boolean
  identity: string
  isActive: boolean
  token: string
}
interface DevError {
  data?: ErrorData
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
  errorStore: DevError[] = [],
  mutationStore: DevMutation[] = [],
  cacheStore = new Map<string, DevCacheEntry>(),
  subStore = new Map<number, DevSubscription>()
let nextId = 1
const listeners: (() => void)[] = [],
  connectionStore: DevConnection = {
    connectionError: '',
    connectionId: '',
    hasConnection: false,
    identity: '',
    isActive: false,
    token: ''
  },
  notify = () => {
    for (const fn of listeners) fn()
  },
  toDisplay = (value: unknown): string => {
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
  setConnectionState = (nextState: Partial<DevConnection>) => {
    let changed = false
    const keys = Object.keys(nextState) as (keyof DevConnection)[],
      store = connectionStore as unknown as Record<keyof DevConnection, DevConnection[keyof DevConnection]>
    for (const k of keys) {
      const val = nextState[k]
      if (val !== undefined && store[k] !== val) {
        store[k] = val
        changed = true
      }
    }
    if (changed) notify()
  },
  /** Records a reducer error in the devtools store. */
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
  /** Clears all tracked errors from the devtools store. */
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
  trackReducerCall = (name: string, args?: Record<string, unknown>): number => trackMutation(name, args),
  completeMutation = (id: number, status: 'error' | 'success') => {
    const entry = mutationStore.find(m => m.id === id)
    if (!entry) return
    entry.status = status
    entry.endedAt = Date.now()
    entry.durationMs = entry.endedAt - entry.startedAt
    notify()
  },
  completeReducerCall = (id: number, status: 'error' | 'success') => completeMutation(id, status),
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
  /** Clears all tracked mutations from the devtools store. */
  clearMutations = () => {
    mutationStore.length = 0
    notify()
  },
  /** Injects a synthetic error into the devtools error panel for testing. */
  injectError = (code: ErrorCode, opts?: { detail?: string; message?: string; op?: string; table?: string }) => {
    const data: ErrorData = { code, ...opts },
      entry: DevError = {
        data,
        detail: opts?.detail ?? `Injected error: ${code}`,
        id: nextId,
        message: opts?.message ?? code,
        timestamp: Date.now()
      }
    nextId += 1
    errorStore.unshift(entry)
    if (errorStore.length > MAX_ERRORS) errorStore.length = MAX_ERRORS
    notify()
  },
  /** Subscribes to the devtools error store for rendering error UI. */
  useDevErrors = () => {
    // eslint-disable-next-line react/hook-use-state
    const [, setTick] = useState(0),
      spacetime = useSpacetimeDB(),
      { connectionError, connectionId, identity, isActive, token } = spacetime
    useEffect(() => {
      const fn = () => setTick(t => t + 1)
      listeners.push(fn)
      return () => {
        const idx = listeners.indexOf(fn)
        if (idx !== -1) listeners.splice(idx, 1)
      }
    }, [])
    useEffect(() => {
      setConnectionState({
        connectionError: connectionError ? getErrorMessage(connectionError) : '',
        connectionId: toDisplay(connectionId),
        hasConnection: Boolean(spacetime.getConnection()),
        identity: toDisplay(identity),
        isActive,
        token: token ?? ''
      })
    }, [connectionError, connectionId, identity, isActive, spacetime, token])
    /** biome-ignore lint/correctness/useExhaustiveDependencies: store sizes are reactivity triggers */
    return useMemo(
      () => ({
        cache: [...cacheStore.values()],
        clear: clearErrors,
        clearMutations,
        connection: { ...connectionStore },
        errors: [...errorStore],
        mutations: [...mutationStore],
        push: pushError,
        subscriptions: [...subStore.values()]
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [errorStore.length, mutationStore.length, subStore.size, cacheStore.size, connectionStore]
    )
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
