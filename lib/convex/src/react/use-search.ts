'use client'
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server'
import { useQuery } from 'convex/react'
import { useCallback, useEffect, useRef, useState } from 'react'
type SearchFn = FunctionReference<'query'>
interface UseSearchOptions {
  debounceMs?: number
  minLength?: number
}
interface UseSearchResult<T> {
  isSearching: boolean
  query: string
  results: T
  setQuery: (q: string) => void
}
const DEFAULT_DEBOUNCE_MS = 300
const DEFAULT_MIN_LENGTH = 1
/** Debounced search hook that queries a Convex search endpoint with configurable delay and minimum length. */
const useSearch = <F extends SearchFn>(
  searchRef: F,
  argsBuilder: (query: string) => OptionalRestArgs<F>[0],
  options?: UseSearchOptions
): UseSearchResult<FunctionReturnType<F> | undefined> => {
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const minLength = options?.minLength ?? DEFAULT_MIN_LENGTH
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const timerRef = useRef<null | ReturnType<typeof setTimeout>>(null)
  const setSearchQuery = useCallback(
    (q: string) => {
      setQuery(q)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setDebouncedQuery(q), debounceMs)
    },
    [debounceMs]
  )
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )
  const shouldSearch = debouncedQuery.length >= minLength
  const args = shouldSearch ? argsBuilder(debouncedQuery) : 'skip'
  const results = useQuery(searchRef, args as OptionalRestArgs<F>[0])
  const isSearching = query !== debouncedQuery || (shouldSearch && results === undefined)
  return {
    isSearching,
    query,
    results: shouldSearch ? results : (undefined as FunctionReturnType<F> | undefined),
    setQuery: setSearchQuery
  }
}
export type { UseSearchOptions, UseSearchResult }
export { DEFAULT_DEBOUNCE_MS, DEFAULT_MIN_LENGTH, useSearch }
