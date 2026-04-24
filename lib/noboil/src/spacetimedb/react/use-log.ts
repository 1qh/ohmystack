'use client'
import { useMemo } from 'react'
import { useTable } from 'spacetimedb/react'
import { useMut } from './use-mutate'
interface LogHookResult<T> {
  append: (args: { idempotencyKey?: string; payload: Partial<T> }) => Promise<void>
  data: T[]
  isLoading: boolean
  purge: () => Promise<void>
}
interface LogRowBase {
  parent: string
  seq: number
}
interface StdbLogRefs {
  append: unknown
  purgeByParent: unknown
  table: unknown
}
const useLog = <T extends LogRowBase>(refs: StdbLogRefs, args: { parent: string }): LogHookResult<T> => {
  const [rows, isReady] = useTable(refs.table as never) as [T[], boolean]
  const appendFn = useMut<Record<string, unknown>>(refs.append)
  const purgeFn = useMut<Record<string, unknown>>(refs.purgeByParent)
  const data = useMemo(() => {
    const filtered = rows.filter(r => r.parent === args.parent)
    filtered.sort((a, b) => a.seq - b.seq)
    return filtered
  }, [rows, args.parent])
  return {
    append: async ({ idempotencyKey, payload }) => {
      await appendFn({ ...payload, idempotencyKey: idempotencyKey ?? null, parent: args.parent })
    },
    data,
    isLoading: !isReady,
    purge: async () => {
      await purgeFn({ parent: args.parent })
    }
  }
}
export type { LogHookResult, LogRowBase, StdbLogRefs }
export { useLog }
