'use client'

import { createContext, use, useRef, useSyncExternalStore } from 'react'

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
