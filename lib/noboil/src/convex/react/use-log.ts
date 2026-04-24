'use client'
import type { FunctionReference, FunctionReturnType } from 'convex/server'
import { useMutation } from 'convex/react'
import { useList } from './use-list'
interface ConvexLogRefs {
  append: FunctionReference<'mutation'>
  auth?: { list: FunctionReference<'query'>; read?: FunctionReference<'query'>; search?: FunctionReference<'query'> }
  authIndexed?: FunctionReference<'query'>
  list: FunctionReference<'query'>
  listAfter: FunctionReference<'query'>
  pub?: { list: FunctionReference<'query'>; read?: FunctionReference<'query'>; search?: FunctionReference<'query'> }
  pubIndexed?: FunctionReference<'query'>
  purgeByParent: FunctionReference<'mutation'>
  read?: FunctionReference<'query'>
  restoreByParent?: FunctionReference<'mutation'>
  rm?: FunctionReference<'mutation'>
  search?: FunctionReference<'query'>
  update?: FunctionReference<'mutation'>
}
interface LogHookResult<T> {
  append: (args: { idempotencyKey?: string; payload: Partial<T> }) => Promise<void>
  appendBulk: (items: (Partial<T> & { idempotencyKey?: string })[]) => Promise<void>
  data: T[]
  hasMore: boolean
  isLoading: boolean
  loadMore: (n?: number) => void
  purge: () => Promise<void>
  restore: () => Promise<void>
  rm: (id: string) => Promise<void>
  rmBulk: (ids: string[]) => Promise<void>
  update: (args: { expectedUpdatedAt?: number; id: string; patch: Partial<T> }) => Promise<void>
}
type LogItem<R extends ConvexLogRefs> = FunctionReturnType<R['list']> extends { page: (infer T)[] } ? T : unknown
const useLog = <R extends ConvexLogRefs>(refs: R, args: { parent: string }): LogHookResult<LogItem<R>> => {
  const { data, hasMore, isLoading, loadMore } = useList(refs.list, { parent: args.parent })
  const appendMut = useMutation(refs.append)
  const purgeMut = useMutation(refs.purgeByParent)
  const restoreMut = useMutation(refs.restoreByParent ?? refs.purgeByParent)
  const rmMut = useMutation(refs.rm ?? refs.purgeByParent)
  const updateMut = useMutation(refs.update ?? refs.purgeByParent)
  return {
    append: async ({ idempotencyKey, payload }) => {
      await appendMut({ idempotencyKey, parent: args.parent, payload })
    },
    appendBulk: async items => {
      await appendMut({ items, parent: args.parent })
    },
    data: data as LogItem<R>[],
    hasMore,
    isLoading,
    loadMore,
    purge: async () => {
      await purgeMut({ parent: args.parent })
    },
    restore: async () => {
      if (refs.restoreByParent) await restoreMut({ parent: args.parent })
    },
    rm: async (id: string) => {
      if (refs.rm) await rmMut({ id })
    },
    rmBulk: async (ids: string[]) => {
      if (refs.rm) await rmMut({ ids })
    },
    update: async ({ expectedUpdatedAt, id, patch }) => {
      if (refs.update) await updateMut({ expectedUpdatedAt, id, ...patch })
    }
  }
}
export type { ConvexLogRefs, LogHookResult }
export { useLog }
