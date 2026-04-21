'use client'
import type { FunctionReference, FunctionReturnType } from 'convex/server'
import { useMutation } from 'convex/react'
import type { CrudOptions, CrudResult } from '../../shared/react/use-crud'
import { useList } from './use-list'
interface ConvexCrudRefs {
  create: FunctionReference<'mutation'>
  list: FunctionReference<'query'>
  rm: FunctionReference<'mutation'>
  update: FunctionReference<'mutation'>
}
type ListItem<R extends ConvexCrudRefs> = FunctionReturnType<R['list']> extends { page: (infer T)[] } ? T : unknown
const useCrud = <R extends ConvexCrudRefs>(refs: R, options?: CrudOptions): CrudResult<ListItem<R>> => {
  const { data, hasMore, isLoading, loadMore } = useList(refs.list, options?.where ? { where: options.where } : {})
  const createMut = useMutation(refs.create)
  const updateMut = useMutation(refs.update)
  const rmMut = useMutation(refs.rm)
  return {
    create: async (d: Partial<ListItem<R>>) => {
      await createMut(d)
    },
    data: data as ListItem<R>[],
    hasMore,
    isLoading,
    loadMore,
    rm: async (id: unknown) => {
      await rmMut({ id })
    },
    update: async (args: Partial<ListItem<R>> & { id: unknown }) => {
      await updateMut(args)
    }
  }
}
export { useCrud }
export type { ConvexCrudRefs }
