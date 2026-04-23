'use client'
import { useMemo } from 'react'
import { useTable } from 'spacetimedb/react'
import { useMut } from './use-mutate'
interface KvHookResult<T> {
  data: null | T
  isLoading: boolean
  remove: () => Promise<void>
  update: (payload: Partial<T>) => Promise<void>
}
interface KvRowBase {
  key: string
}
interface StdbKvRefs {
  rm: unknown
  set: unknown
  table: { tableName: string }
}
const useKv = <T extends KvRowBase>(refs: StdbKvRefs, key: string): KvHookResult<T> => {
  const [rows, isReady] = useTable(refs.table as never) as [T[], boolean]
  const setFn = useMut<Record<string, unknown>>(refs.set)
  const rmFn = useMut<Record<string, unknown>>(refs.rm)
  const data = useMemo(() => rows.find(r => r.key === key) ?? null, [rows, key])
  return {
    data,
    isLoading: !isReady,
    remove: async () => {
      await rmFn({ key })
    },
    update: async (payload: Partial<T>) => {
      await setFn({ ...payload, key })
    }
  }
}
export type { KvHookResult, KvRowBase, StdbKvRefs }
export { useKv }
