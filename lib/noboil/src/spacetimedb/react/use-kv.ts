'use client'
import { useMemo } from 'react'
import { useTable } from 'spacetimedb/react'
import { useMut } from './use-mutate'
interface KvHookResult<T> {
  data: null | T
  isLoading: boolean
  remove: () => Promise<void>
  restore: () => Promise<void>
  update: (payload: Partial<T>, opts?: { expectedUpdatedAt?: unknown }) => Promise<void>
}
interface KvRowBase {
  deletedAt?: unknown
  key: string
}
interface StdbKvRefs {
  restore?: unknown
  rm: unknown
  set: unknown
  table: unknown
}
const useKv = <T extends KvRowBase>(refs: StdbKvRefs, key: string): KvHookResult<T> => {
  const [rows, isReady] = useTable(refs.table as never) as [T[], boolean]
  const setFn = useMut<Record<string, unknown>>(refs.set)
  const rmFn = useMut<Record<string, unknown>>(refs.rm)
  const restoreFn = useMut<Record<string, unknown>>(refs.restore ?? refs.rm)
  const data = useMemo(() => rows.find(r => r.key === key && !r.deletedAt) ?? null, [rows, key])
  return {
    data,
    isLoading: !isReady,
    remove: async () => {
      await rmFn({ key })
    },
    restore: async () => {
      if (refs.restore) await restoreFn({ key })
    },
    update: async (payload: Partial<T>, opts?: { expectedUpdatedAt?: unknown }) => {
      await setFn({ ...payload, expectedUpdatedAt: opts?.expectedUpdatedAt, key })
    }
  }
}
export type { KvHookResult, KvRowBase, StdbKvRefs }
export { useKv }
