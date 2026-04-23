'use client'
import type { FunctionReference, FunctionReturnType } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
interface ConvexKvRefs {
  get: FunctionReference<'query'>
  list: FunctionReference<'query'>
  rm: FunctionReference<'mutation'>
  set: FunctionReference<'mutation'>
}
type KvDoc<R extends ConvexKvRefs> = FunctionReturnType<R['get']>
interface KvHookResult<T> {
  data: null | T | undefined
  remove: () => Promise<void>
  update: (payload: T) => Promise<void>
}
const useKv = <R extends ConvexKvRefs>(refs: R, key: string): KvHookResult<KvDoc<R>> => {
  const data = useQuery(refs.get, { key }) as KvDoc<R> | undefined
  const setMut = useMutation(refs.set)
  const rmMut = useMutation(refs.rm)
  return {
    data,
    remove: async () => {
      await rmMut({ key })
    },
    update: async (payload: KvDoc<R>) => {
      await setMut({ key, payload })
    }
  }
}
export type { ConvexKvRefs, KvHookResult }
export { useKv }
