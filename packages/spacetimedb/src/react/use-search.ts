'use client'

import { useEffect, useMemo, useState } from 'react'

type Rec = Record<string, unknown>

interface UseSearchOptions<T extends Rec = Rec> {
  debounceMs?: number
  fields: (keyof T & string)[]
  query: string
}

interface UseSearchResult<T> {
  isSearching: boolean
  results: T[]
}

const normalizeQuery = (query: string): string => query.trim().toLowerCase(),
  rowMatchesQuery = (row: Rec, fields: string[], normalizedQuery: string): boolean => {
    for (const field of fields) {
      const value = row[field]
      if (String(value).toLowerCase().includes(normalizedQuery)) return true
    }
    return false
  },
  filterSearchData = <T extends Rec>(rows: T[], fields: string[], normalizedQuery: string): T[] => {
    if (!normalizedQuery) return rows
    const out: T[] = []
    for (const row of rows) if (rowMatchesQuery(row, fields, normalizedQuery)) out.push(row)
    return out
  },
  DEFAULT_DEBOUNCE_MS = 300,
  SKIP_SEARCH: UseSearchResult<never> = { isSearching: true, results: [] },
  
  useSearch = <T extends Rec>(data: T[], isReady: boolean, options: 'skip' | UseSearchOptions<T>): UseSearchResult<T> => {
    const skipped = options === 'skip',
      opts = skipped ? { debounceMs: DEFAULT_DEBOUNCE_MS, fields: [] as (keyof T & string)[], query: '' } : options,
      debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      [debouncedQuery, setDebouncedQuery] = useState(opts.query)

    useEffect(() => {
      if (skipped) return
      const id = setTimeout(() => setDebouncedQuery(opts.query), debounceMs)
      return () => clearTimeout(id)
    }, [debounceMs, opts.query, skipped])

    const results = useMemo(() => {
        if (skipped || !isReady) return []
        return filterSearchData(data, opts.fields, normalizeQuery(debouncedQuery))
      }, [data, debouncedQuery, isReady, opts.fields, skipped]),
      isSearching = skipped || opts.query !== debouncedQuery || !isReady

    if (skipped) return SKIP_SEARCH as UseSearchResult<T>

    return { isSearching, results }
  }

export type { UseSearchOptions, UseSearchResult }
export { DEFAULT_DEBOUNCE_MS, useSearch }
