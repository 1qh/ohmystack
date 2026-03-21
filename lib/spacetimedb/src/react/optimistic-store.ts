'use client'
import { createContext, createElement, use, useMemo, useRef, useSyncExternalStore } from 'react'
import { noop } from './list-utils'
type MutationType = 'create' | 'delete' | 'update'
interface OptimisticStore {
  add: (entry: PendingMutation) => void
  getSnapshot: () => PendingMutation[]
  overlay: <T extends Record<string, unknown> & { _id: string }>(rows: T[]) => T[]
  reconcileIds: (ids: string[]) => void
  reconcileRows: (rows: { _id: string }[]) => void
  remove: (tempId: string) => void
  subscribe: (cb: () => void) => () => void
}
interface PendingMutation {
  args: Record<string, unknown>
  id: string
  tempId: string
  timestamp: number
  type: MutationType
}
let counter = 0
/**
 * Generates a temporary id used for optimistic mutation entries.
 * @returns A unique optimistic temp id string.
 */
const makeTempId = () => {
    counter += 1
    return `__optimistic_${counter}_${Date.now()}`
  },
  emptySubscribe = () => noop,
  classifyPending = (pending: PendingMutation[]) => {
    const deleteIds = new Set<string>(),
      updates = new Map<string, Record<string, unknown>>(),
      creates: Record<string, unknown>[] = []
    for (const p of pending)
      if (p.type === 'delete') deleteIds.add(p.id)
      else if (p.type === 'update') {
        const prev = updates.get(p.id)
        updates.set(p.id, prev ? { ...prev, ...p.args } : p.args)
      } else
        creates.push({
          ...p.args,
          __optimistic: true,
          _creationTime: p.timestamp,
          _id: p.tempId,
          updatedAt: p.timestamp
        })
    return { creates, deleteIds, updates }
  },
  /**
   * Creates an in-memory optimistic mutation store.
   * @returns Store methods for tracking and overlaying pending mutations.
   */
  createOptimisticStore = (): OptimisticStore => {
    const entries = new Map<string, PendingMutation>(),
      order: string[] = [],
      listeners = new Set<() => void>(),
      notify = () => {
        for (const fn of listeners) fn()
      },
      getSnapshot = () => {
        const out: PendingMutation[] = []
        for (const tempId of order) {
          const entry = entries.get(tempId)
          if (entry) out.push(entry)
        }
        return out
      }
    return {
      add: (entry: PendingMutation) => {
        entries.set(entry.tempId, entry)
        order.push(entry.tempId)
        notify()
      },
      getSnapshot,
      overlay: <T extends Record<string, unknown> & { _id: string }>(rows: T[]): T[] => {
        const pending = getSnapshot()
        if (pending.length === 0) return rows
        const { creates, deleteIds, updates } = classifyPending(pending)
        let result: T[] = rows
        if (deleteIds.size > 0) result = result.filter(row => !deleteIds.has(row._id))
        if (updates.size > 0) {
          const next: T[] = []
          for (const row of result) {
            const patch = updates.get(row._id)
            next.push(patch ? ({ ...row, ...patch, _id: row._id } as T) : row)
          }
          result = next
        }
        if (creates.length > 0) {
          const optimisticRows: T[] = []
          for (let i = creates.length - 1; i >= 0; i -= 1) optimisticRows.push(creates[i] as T)
          result = [...optimisticRows, ...result]
        }
        return result
      },
      reconcileIds: (ids: string[]) => {
        if (ids.length === 0) return
        const idSet = new Set(ids)
        let changed = false
        for (let i = order.length - 1; i >= 0; i -= 1) {
          const tempId = order[i]
          if (tempId) {
            const entry = entries.get(tempId)
            if (entry && idSet.has(entry.id)) {
              entries.delete(tempId)
              order.splice(i, 1)
              changed = true
            }
          }
        }
        if (changed) notify()
      },
      reconcileRows: (rows: { _id: string }[]) => {
        const ids: string[] = []
        for (const row of rows) ids.push(row._id)
        if (ids.length > 0) {
          const idSet = new Set(ids)
          let changed = false
          for (let i = order.length - 1; i >= 0; i -= 1) {
            const tempId = order[i]
            if (tempId) {
              const entry = entries.get(tempId)
              if (entry && idSet.has(entry.id)) {
                entries.delete(tempId)
                order.splice(i, 1)
                changed = true
              }
            }
          }
          if (changed) notify()
        }
      },
      remove: (tempId: string) => {
        if (!entries.has(tempId)) return
        entries.delete(tempId)
        for (let i = 0; i < order.length; i += 1)
          if (order[i] === tempId) {
            order.splice(i, 1)
            break
          }
        notify()
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      }
    }
  },
  OptimisticContext = createContext<null | OptimisticStore>(null),
  /**
   * Reads the optimistic store from context.
   * @returns The optimistic store when available, otherwise `null`.
   */
  useOptimisticStore = (): null | OptimisticStore => use(OptimisticContext),
  /**
   * Subscribes to pending optimistic mutations.
   * @returns Current list of pending mutation entries.
   */
  usePendingMutations = (): PendingMutation[] => {
    const store = useOptimisticStore(),
      emptyRef = useRef<PendingMutation[]>([])
    return useSyncExternalStore(
      store ? store.subscribe : emptySubscribe,
      store ? store.getSnapshot : () => emptyRef.current,
      store ? store.getSnapshot : () => emptyRef.current
    )
  },
  /**
   * Provides an optimistic store instance to descendants.
   * @param props Provider children.
   * @returns Optimistic context provider element.
   */
  OptimisticProvider = ({ children }: { children: React.ReactNode }) => {
    const store = useMemo(() => createOptimisticStore(), [])
    return createElement(OptimisticContext, { value: store }, children)
  }
export type { MutationType, OptimisticStore, PendingMutation }
export {
  createOptimisticStore,
  makeTempId,
  OptimisticContext,
  OptimisticProvider,
  useOptimisticStore,
  usePendingMutations
}
