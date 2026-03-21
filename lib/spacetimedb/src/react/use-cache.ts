/* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { trackCacheAccess } from './devtools'
interface FireLoadCtx<A extends Record<string, unknown>> {
  args: A
  load: (args: A) => Promise<void>
  loadingRef: React.RefObject<boolean>
  setIsLoading: (value: boolean) => void
  table: string
}
interface UseCacheEntryOptions<A extends Record<string, unknown>, T extends Record<string, unknown>> {
  args: A
  data: null | T | undefined
  load: (args: A) => Promise<void>
  table: string
}
interface UseCacheEntryResult<T> {
  data: null | T
  isLoading: boolean
  isStale: boolean
  refresh: () => void
}
const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production',
  fireLoad = async <A extends Record<string, unknown>>({
    args,
    load,
    loadingRef,
    setIsLoading,
    table
  }: FireLoadCtx<A>) => {
    try {
      await load(args)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[@noboil/spacetimedb] Cache load failed (table=%s, args=%o):', table, args, error)
    } finally {
      loadingRef.current = false
      setIsLoading(false)
    }
  },
  /**
   * Reads a cache row and auto-loads it when stale or missing.
   * @param options Cache table, load function, key args, and current row value.
   * @returns Cache row state with staleness, loading, and refresh controls.
   */
  useCacheEntry = <A extends Record<string, unknown>, T extends Record<string, unknown>>({
    args,
    data,
    load,
    table
  }: UseCacheEntryOptions<A, T>): UseCacheEntryResult<T> => {
    const [isLoading, setIsLoading] = useState(false),
      loadingRef = useRef(false),
      argsRef = useRef(args)
    useEffect(() => {
      argsRef.current = args
    }, [args])
    useEffect(() => {
      if (loadingRef.current) return
      const isStale = data !== undefined && (data === null || data.stale === true)
      if (!isStale) return
      loadingRef.current = true
      setIsLoading(true)
      fireLoad({ args: argsRef.current, load, loadingRef, setIsLoading, table })
    }, [data, load, table])
    useEffect(() => {
      if (!(isDev && data !== undefined)) return
      const stale = data === null || data.stale === true
      trackCacheAccess({ hit: !stale, key: JSON.stringify(args), stale, table })
    }, [args, data, table])
    const refresh = useCallback(() => {
        if (loadingRef.current) return
        loadingRef.current = true
        setIsLoading(true)
        fireLoad({ args: argsRef.current, load, loadingRef, setIsLoading, table })
      }, [load, table]),
      cacheData = data === undefined ? null : data,
      isStale = cacheData !== null && cacheData.stale === true
    return { data: cacheData, isLoading: isLoading || data === undefined, isStale, refresh }
  }
export type { UseCacheEntryOptions, UseCacheEntryResult }
export { useCacheEntry }
