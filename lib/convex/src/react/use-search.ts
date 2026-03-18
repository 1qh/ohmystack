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

const DEFAULT_DEBOUNCE_MS = 300,
  DEFAULT_MIN_LENGTH = 1,
  /** Debounced search hook that queries a Convex search endpoint with configurable delay and minimum length. */
  useSearch = <F extends SearchFn>(
    searchRef: F,
    argsBuilder: (query: string) => OptionalRestArgs<F>[0],
    options?: UseSearchOptions
  ): UseSearchResult<FunctionReturnType<F> | undefined> => {
    const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      minLength = options?.minLength ?? DEFAULT_MIN_LENGTH,
      [query, setQuery] = useState(''),
      [debouncedQuery, setDebouncedQuery] = useState(''),
      timerRef = useRef<null | ReturnType<typeof setTimeout>>(null),
      setSearchQuery = useCallback(
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

    const shouldSearch = debouncedQuery.length >= minLength,
      args = shouldSearch ? argsBuilder(debouncedQuery) : 'skip',
      results = useQuery(searchRef, args as OptionalRestArgs<F>[0]),
      isSearching = query !== debouncedQuery || (shouldSearch && results === undefined)

    return {
      isSearching,
      query,
      results: shouldSearch ? results : (undefined as FunctionReturnType<F> | undefined),
      setQuery: setSearchQuery
    }
  }

export type { UseSearchOptions, UseSearchResult }
export { DEFAULT_DEBOUNCE_MS, DEFAULT_MIN_LENGTH, useSearch }
