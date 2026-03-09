'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ListSort, ListWhere, Rec } from './list-utils'

import { matchW } from '../server/helpers'
import { noop, searchMatches, sortData } from './list-utils'

/** Client-side infinite-list options for filtering, sorting, and searching. */
interface InfiniteListOptions<T extends Rec = Rec> {
  batchSize?: number
  search?: { debounceMs?: number; fields: (keyof T & string)[]; query: string }
  sort?: ListSort<T>
  where?: ListWhere<T>
}

/** Default batch size used by `useInfiniteList`. */
const DEFAULT_BATCH_SIZE = 50,
  /** Builds an infinite-scroll list from in-memory rows.
   * @param data - Source rows
   * @param isReady - Subscription readiness state
   * @param options - Sorting and filter options
   * @returns List slice and load-more controls
   * @example
   * ```ts
   * const list = useInfiniteList(rows, ready, { batchSize: 25 })
   * ```
   */
  SKIP_RESULT = {
    data: [] as never[],
    hasMore: false,
    isLoading: false,
    loadMore: noop,
    totalCount: 0
  },
  /**
   * Builds an infinite-scroll view from local rows with where/search/sort.
   * @param data Source rows.
   * @param isReady Subscription readiness state.
   * @param options Filtering, searching, sorting, and batch-size options.
   * @returns Visible rows plus load-more and loading metadata.
   */
  useInfiniteList = <T extends Rec>(data: T[], isReady: boolean, options?: 'skip' | InfiniteListOptions<T>) => {
    const skipped = options === 'skip',
      opts = skipped ? undefined : options,
      batchSize = Math.max(1, opts?.batchSize ?? DEFAULT_BATCH_SIZE),
      rawQuery = opts?.search?.query ?? '',
      debounceMs = opts?.search?.debounceMs,
      [debouncedQuery, setDebouncedQuery] = useState(rawQuery),
      [visibleCount, setVisibleCount] = useState(batchSize),
      whereRef = useRef(opts?.where),
      searchQueryRef = useRef(rawQuery)

    useEffect(() => {
      if (!debounceMs) {
        setDebouncedQuery(rawQuery)
        return
      }
      const id = setTimeout(() => setDebouncedQuery(rawQuery), debounceMs)
      return () => clearTimeout(id)
    }, [debounceMs, rawQuery])

    const searchQuery = debounceMs ? debouncedQuery : rawQuery

    useEffect(() => {
      const whereChanged = whereRef.current !== opts?.where,
        searchChanged = searchQueryRef.current !== searchQuery
      whereRef.current = opts?.where
      searchQueryRef.current = searchQuery
      if (whereChanged || searchChanged) setVisibleCount(batchSize)
    }, [batchSize, opts?.where, searchQuery])

    const filtered = useMemo(() => {
        if (skipped || !opts?.where) return skipped ? [] : data
        const out: T[] = []
        for (const row of data) if (matchW(row, opts.where)) out.push(row)
        return out
      }, [data, opts?.where, skipped]),
      searched = useMemo(() => {
        if (skipped) return []
        const fields = opts?.search?.fields ?? []
        if (searchQuery === '' || fields.length === 0) return filtered
        const out: T[] = []
        for (const row of filtered) if (searchMatches(row, searchQuery, fields)) out.push(row)
        return out
      }, [filtered, searchQuery, opts?.search?.fields, skipped]),
      sorted = useMemo(() => (skipped ? [] : sortData(searched, opts?.sort)), [searched, opts?.sort, skipped]),
      hasMore = visibleCount < sorted.length,
      sliced = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]),
      loadMore = useCallback(() => {
        if (!hasMore) return
        setVisibleCount(v => v + batchSize)
      }, [batchSize, hasMore])

    if (skipped) return SKIP_RESULT

    return {
      data: sliced,
      hasMore,
      isLoading: !isReady,
      loadMore,
      totalCount: sorted.length
    }
  }

/** Result shape returned by `useInfiniteList` with normal options. */
interface InfiniteListResult<T extends Rec> {
  data: T[]
  hasMore: boolean
  isLoading: boolean
  loadMore: () => void
  totalCount: number
}

/** Result shape returned when `useInfiniteList` options is `'skip'`. */
interface SkipInfiniteListResult {
  data: never[]
  hasMore: false
  isLoading: false
  loadMore: () => void
  totalCount: 0
}

export type { InfiniteListOptions, InfiniteListResult, ListWhere as InfiniteListWhere, SkipInfiniteListResult }
export { DEFAULT_BATCH_SIZE, useInfiniteList }
