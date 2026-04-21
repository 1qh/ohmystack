/** biome-ignore-all lint/style/noProcessEnv: env detection */
'use client'
/* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
import type { FunctionReference, OptionalRestArgs } from 'convex/server'
import { useAction, useQuery } from 'convex/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { trackCacheAccess } from './devtools'
type ActionRef = FunctionReference<'action'>
interface FireLoadCtx {
  args: Record<string, unknown>
  load: (a: Record<string, unknown>) => Promise<unknown>
  loadingRef: React.RefObject<boolean>
  setIsLoading: (v: boolean) => void
}
type QueryRef = FunctionReference<'query'>
const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
const fireLoad = async ({ args, load, loadingRef, setIsLoading }: FireLoadCtx) => {
  try {
    await load(args)
  } catch {
    /* oxlint-disable-next-line no-empty */
  } finally {
    loadingRef.current = false
    setIsLoading(false)
  }
}
/** Options for useCacheEntry: the query to read cached data and the action to refresh it. */
interface UseCacheEntryOptions<Q extends QueryRef, A extends ActionRef> {
  args: OptionalRestArgs<Q>[0]
  get: Q
  load: A
}
/** Return value of useCacheEntry with the cached data, loading/stale state, and a refresh function. */
interface UseCacheEntryResult<T> {
  data: null | T
  isLoading: boolean
  isStale: boolean
  refresh: () => void
}
/** Reads a cached entry via a Convex query and auto-triggers the load action when data is stale. Tracks cache hits/misses in devtools. */
const useCacheEntry = <Q extends QueryRef, A extends ActionRef>({
  args,
  get: getRef,
  load: loadRef
}: UseCacheEntryOptions<Q, A>): UseCacheEntryResult<Record<string, unknown>> => {
  const cached = useQuery(getRef, args ?? {})
  const load = useAction(loadRef)
  const [isLoading, setIsLoading] = useState(false)
  const loadingRef = useRef(false)
  const argsRef = useRef(args)
  const queryName = typeof getRef === 'string' ? getRef : ((getRef as { _name?: string })._name ?? 'unknown')
  useEffect(() => {
    argsRef.current = args
  }, [args])
  useEffect(() => {
    if (loadingRef.current) return
    const isStale = cached !== undefined && (cached === null || cached.stale === true)
    if (!isStale) return
    loadingRef.current = true
    setIsLoading(true)
    fireLoad({
      args: argsRef.current ?? {},
      load: load as (a: Record<string, unknown>) => Promise<unknown>,
      loadingRef,
      setIsLoading
    })
  }, [cached, load])
  useEffect(() => {
    if (!isDev || cached === undefined) return
    const stale = cached === null || cached.stale === true
    trackCacheAccess({ hit: !stale, key: JSON.stringify(args ?? {}), stale, table: queryName })
  }, [cached, args, queryName])
  const refresh = useCallback(() => {
    if (loadingRef.current) return
    loadingRef.current = true
    setIsLoading(true)
    fireLoad({
      args: argsRef.current ?? {},
      load: load as (a: Record<string, unknown>) => Promise<unknown>,
      loadingRef,
      setIsLoading
    })
  }, [load])
  const data = cached ?? null
  const isStale = data !== null && data.stale === true
  return { data, isLoading: isLoading || cached === undefined, isStale, refresh }
}
export type { UseCacheEntryOptions, UseCacheEntryResult }
export { useCacheEntry }
