'use client'

import { createContext, use, useRef, useSyncExternalStore } from 'react'

/** The kind of mutation: create, update, or delete. */
type MutationType = 'create' | 'delete' | 'update'

interface OptimisticStore {
  add: (entry: PendingMutation) => void
  getSnapshot: () => PendingMutation[]
  remove: (tempId: string) => void
  subscribe: (cb: () => void) => () => void
}

/** Represents a mutation that has been optimistically applied but not yet confirmed by the server. */
interface PendingMutation {
  args: Record<string, unknown>
  id: string
  tempId: string
  timestamp: number
  type: MutationType
}

const noop = () => {
  /* No-op */
}
let counter = 0

const makeTempId = () => {
    counter += 1
    return `__optimistic_${counter}_${Date.now()}`
  },
  createOptimisticStore = (): OptimisticStore => {
    let entries: PendingMutation[] = []
    const listeners = new Set<() => void>(),
      notify = () => {
        for (const fn of listeners) fn()
      }
    return {
      add: (entry: PendingMutation) => {
        entries = [...entries, entry]
        notify()
      },
      getSnapshot: () => entries,
      remove: (tempId: string) => {
        entries = entries.filter(e => e.tempId !== tempId)
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
  /** React context that holds the optimistic mutation store. */
  OptimisticContext = createContext<null | OptimisticStore>(null),
  useOptimisticStore = (): null | OptimisticStore => use(OptimisticContext),
  /** Returns all pending optimistic mutations from the store, or an empty array if no provider exists. */
  usePendingMutations = (): PendingMutation[] => {
    const store = useOptimisticStore(),
      emptyRef = useRef<PendingMutation[]>([])
    return useSyncExternalStore(
      store ? store.subscribe : () => noop,
      store ? store.getSnapshot : () => emptyRef.current,
      store ? store.getSnapshot : () => emptyRef.current
    )
  }

export type { MutationType, OptimisticStore, PendingMutation }
export { createOptimisticStore, makeTempId, OptimisticContext, useOptimisticStore, usePendingMutations }
