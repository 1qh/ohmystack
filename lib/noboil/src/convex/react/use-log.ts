'use client'
import type { FunctionReference, FunctionReturnType } from 'convex/server'
import { useMutation } from 'convex/react'
import { useList } from './use-list'
interface ConvexLogRefs {
  append: FunctionReference<'mutation'>
  list: FunctionReference<'query'>
  listAfter: FunctionReference<'query'>
  purgeByParent: FunctionReference<'mutation'>
}
interface LogHookResult<T> {
  append: (args: { idempotencyKey?: string; payload: Partial<T> }) => Promise<void>
  data: T[]
  hasMore: boolean
  isLoading: boolean
  loadMore: (n?: number) => void
  purge: () => Promise<void>
}
type LogItem<R extends ConvexLogRefs> = FunctionReturnType<R['list']> extends { page: (infer T)[] } ? T : unknown
const useLog = <R extends ConvexLogRefs>(refs: R, args: { parent: string }): LogHookResult<LogItem<R>> => {
  const { data, hasMore, isLoading, loadMore } = useList(refs.list, { parent: args.parent })
  const appendMut = useMutation(refs.append)
  const purgeMut = useMutation(refs.purgeByParent)
  return {
    append: async ({ idempotencyKey, payload }) => {
      await appendMut({ idempotencyKey, parent: args.parent, payload })
    },
    data: data as LogItem<R>[],
    hasMore,
    isLoading,
    loadMore,
    purge: async () => {
      await purgeMut({ parent: args.parent })
    }
  }
}
export type { ConvexLogRefs, LogHookResult }
export { useLog }
