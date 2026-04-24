'use client'
import type { FunctionReference, FunctionReturnType } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
interface ConvexKvRefs {
  get: FunctionReference<'query'>
  list: FunctionReference<'query'>
  restore?: FunctionReference<'mutation'>
  rm: FunctionReference<'mutation'>
  set: FunctionReference<'mutation'>
}
type KvDoc<R extends ConvexKvRefs> = FunctionReturnType<R['get']>
interface KvHookResult<T> {
  data: null | T | undefined
  remove: () => Promise<void>
  restore: () => Promise<void>
  update: (payload: T, opts?: { expectedUpdatedAt?: number }) => Promise<void>
}
const useKv = <R extends ConvexKvRefs>(refs: R, key: string): KvHookResult<KvDoc<R>> => {
  const data = useQuery(refs.get, { key }) as KvDoc<R> | undefined
  const setMut = useMutation(refs.set)
  const rmMut = useMutation(refs.rm)
  const restoreMut = useMutation(refs.restore ?? refs.rm)
  return {
    data,
    remove: async () => {
      await rmMut({ key })
    },
    restore: async () => {
      if (refs.restore) await restoreMut({ key })
    },
    update: async (payload: KvDoc<R>, opts?: { expectedUpdatedAt?: number }) => {
      await setMut({ expectedUpdatedAt: opts?.expectedUpdatedAt, key, payload })
    }
  }
}
export type { ConvexKvRefs, KvHookResult }
export { useKv }
