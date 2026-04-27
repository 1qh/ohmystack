'use client'
import type { Identity } from 'spacetimedb'
import { useMemo } from 'react'
import { useTable } from 'spacetimedb/react'
import { useMut } from './use-mutate'
interface SingletonHookResult<T> {
  data: null | T
  isLoading: boolean
  upsert: (payload: Partial<T>) => Promise<void>
}
interface SingletonRowBase {
  userId: Identity
}
interface StdbSingletonRefs {
  table: unknown
  upsert: unknown
}
const identityEquals = (a: Identity | undefined, b: Identity | undefined): boolean => {
  if (!(a && b)) return false
  return a.toHexString() === b.toHexString()
}
const useSingleton = <T extends SingletonRowBase>(
  refs: StdbSingletonRefs,
  sender: Identity | undefined
): SingletonHookResult<T> => {
  const [rows, isReady] = useTable(refs.table as never) as [T[], boolean]
  const upsertFn = useMut<Record<string, unknown>>(refs.upsert)
  const data = useMemo(() => rows.find(r => identityEquals(r.userId, sender)) ?? null, [rows, sender])
  return {
    data,
    isLoading: !isReady,
    upsert: async (payload: Partial<T>) => {
      await upsertFn(payload)
    }
  }
}
export type { SingletonHookResult, SingletonRowBase, StdbSingletonRefs }
export { useSingleton }
