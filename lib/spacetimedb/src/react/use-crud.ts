'use client'
import type { CrudOptions, CrudResult } from '@a/shared/react/use-crud'
import { useTable } from 'spacetimedb/react'
import { useList } from './use-list'
import { useMut } from './use-mutate'
interface StdbCrudRefs {
  create: unknown
  rm: unknown
  table: { tableName: string }
  update: unknown
}
const useCrud = <T extends Record<string, unknown>>(refs: StdbCrudRefs, options?: CrudOptions): CrudResult<T> => {
  const [rows, isReady] = useTable(refs.table as never) as [T[], boolean]
  const { data, hasMore, isLoading, loadMore } = useList(rows, isReady, options as never)
  const create = useMut<Record<string, unknown>>(refs.create)
  const update = useMut<Record<string, unknown>>(refs.update)
  const rm = useMut<Record<string, unknown>>(refs.rm)
  return {
    create: async (d: Partial<T>) => {
      await create(d as Record<string, unknown>)
    },
    data,
    hasMore,
    isLoading,
    loadMore,
    rm: async (id: unknown) => {
      await rm({ id } as Record<string, unknown>)
    },
    update: async (args: Partial<T> & { id: unknown }) => {
      await update(args as Record<string, unknown>)
    }
  }
}
export { useCrud }
export type { StdbCrudRefs }
