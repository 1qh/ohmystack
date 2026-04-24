'use client'
import { useMemo } from 'react'
import { useTable } from 'spacetimedb/react'
import { useMut } from './use-mutate'
interface LogHookResult<T> {
  append: (args: { idempotencyKey?: string; payload: Partial<T> }) => Promise<void>
  appendBulk: (items: (Partial<T> & { idempotencyKey?: null | string })[]) => Promise<void>
  data: T[]
  isLoading: boolean
  purge: () => Promise<void>
  restore: () => Promise<void>
  rm: (id: number) => Promise<void>
  rmBulk: (ids: number[]) => Promise<void>
  update: (args: { id: number; patch: Partial<T> }) => Promise<void>
}
interface LogRowBase {
  deletedAt?: unknown
  parent: string
  seq: number
}
interface StdbLogRefs {
  append: unknown
  bulkAppend?: unknown
  bulkRm?: unknown
  purgeByParent: unknown
  restoreByParent?: unknown
  rm?: unknown
  table: unknown
  update?: unknown
}
const useLog = <T extends LogRowBase>(refs: StdbLogRefs, args: { parent: string }): LogHookResult<T> => {
  const [rows, isReady] = useTable(refs.table as never) as [T[], boolean]
  const appendFn = useMut<Record<string, unknown>>(refs.append)
  const bulkAppendFn = useMut<Record<string, unknown>>(refs.bulkAppend ?? refs.append)
  const purgeFn = useMut<Record<string, unknown>>(refs.purgeByParent)
  const restoreFn = useMut<Record<string, unknown>>(refs.restoreByParent ?? refs.purgeByParent)
  const rmFn = useMut<Record<string, unknown>>(refs.rm ?? refs.purgeByParent)
  const bulkRmFn = useMut<Record<string, unknown>>(refs.bulkRm ?? refs.purgeByParent)
  const updateFn = useMut<Record<string, unknown>>(refs.update ?? refs.purgeByParent)
  const data = useMemo(() => {
    const filtered = rows.filter(r => r.parent === args.parent && !r.deletedAt)
    filtered.sort((a, b) => a.seq - b.seq)
    return filtered
  }, [rows, args.parent])
  return {
    append: async ({ idempotencyKey, payload }) => {
      await appendFn({ ...payload, idempotencyKey: idempotencyKey ?? null, parent: args.parent })
    },
    appendBulk: async items => {
      if (refs.bulkAppend) await bulkAppendFn({ items, parent: args.parent })
    },
    data,
    isLoading: !isReady,
    purge: async () => {
      await purgeFn({ parent: args.parent })
    },
    restore: async () => {
      if (refs.restoreByParent) await restoreFn({ parent: args.parent })
    },
    rm: async (id: number) => {
      if (refs.rm) await rmFn({ id })
    },
    rmBulk: async (ids: number[]) => {
      if (refs.bulkRm) await bulkRmFn({ ids })
    },
    update: async ({ id, patch }) => {
      if (refs.update) await updateFn({ id, ...patch })
    }
  }
}
export type { LogHookResult, LogRowBase, StdbLogRefs }
export { useLog }
