/* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ListSort, ListWhere, Rec, WhereGroup } from './list-utils'

import { matchW } from '../server/helpers'
import { noop, searchMatches, sortData } from './list-utils'
/** Client-side list options for filtering, sorting, searching, and pagination. */
interface UseListOptions<T extends Rec = Rec> {
  page?: number
  pageSize?: number
  search?: { debounceMs?: number; fields: (keyof T & string)[]; query: string }
  sort?: ListSort<T>
  where?: ListWhere<T>
}
/** Default page size used by `useList`. */
const DEFAULT_PAGE_SIZE = 50,
  /** Builds a paginated, filterable, searchable list view from in-memory rows.
   * @param data - Source rows
   * @param isReady - Subscription readiness state
   * @param options - Pagination, filtering, sorting, and search options
   * @returns List state and pagination controls
   * @example
   * ```ts
   * const list = useList(rows, ready, {
   *   pageSize: 20,
   *   where: { own: true },
   *   search: { query: 'hello', fields: ['title', 'content'] }
   * })
   * ```
   */
  SKIP_RESULT = {
    data: [] as never[],
    hasMore: false,
    isLoading: false,
    loadMore: noop,
    page: 1,
    totalCount: 0
  },
  /**
   * Builds a paginated list view from local rows with where/search/sort.
   * @param data Source rows.
   * @param isReady Subscription readiness state.
   * @param options Pagination, filtering, search, and sorting options.
   * @returns Visible rows, pagination state, and load-more controls.
   */
  useList = <T extends Rec>(data: readonly T[], isReady: boolean, options?: 'skip' | UseListOptions<T>) => {
    const skipped = options === 'skip',
      opts = skipped ? undefined : options,
      pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE,
      rawQuery = opts?.search?.query ?? '',
      debounceMs = opts?.search?.debounceMs,
      [debouncedQuery, setDebouncedQuery] = useState(rawQuery),
      [currentPage, setCurrentPage] = useState(opts?.page ?? 1),
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
      if (whereChanged || searchChanged) setCurrentPage(1)
    }, [opts?.where, searchQuery])
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
      totalCount = sorted.length,
      cappedPageSize = Math.max(1, pageSize),
      visibleCount = currentPage * cappedPageSize,
      pagedData = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]),
      hasMore = visibleCount < totalCount,
      loadMore = useCallback(() => {
        if (!hasMore) return
        setCurrentPage(p => p + 1)
      }, [hasMore])
    useEffect(() => {
      if (opts?.page === undefined) return
      setCurrentPage(Math.max(1, opts.page))
    }, [opts?.page])
    useEffect(() => {
      const maxPage = Math.max(1, Math.ceil(totalCount / cappedPageSize))
      if (currentPage > maxPage) setCurrentPage(maxPage)
    }, [cappedPageSize, currentPage, totalCount])
    if (skipped) return SKIP_RESULT
    return {
      data: pagedData,
      hasMore,
      isLoading: !isReady,
      loadMore,
      page: currentPage,
      totalCount
    }
  },
  /** Computes an `own` boolean on each row using a predicate function.
   * @param rows - Source rows
   * @param isOwn - Predicate returning true for owned rows, or null/undefined to mark all false
   * @returns Rows augmented with `own` field
   * @example
   * ```ts
   * const blogs = useOwnRows(allBlogs, identity ? b => b.userId.isEqual(identity) : null)
   * ```
   */
  useOwnRows = <T extends Rec>(
    rows: readonly T[],
    isOwn: ((row: T) => boolean) | null | undefined
  ): (T & { own: boolean })[] =>
    useMemo(() => {
      const out: (T & { own: boolean })[] = []
      for (const row of rows) out.push({ ...row, own: isOwn ? isOwn(row) : false })
      return out
    }, [rows, isOwn])
/** Result shape returned when `useList` options is `'skip'`. */
interface SkipListResult {
  data: never[]
  hasMore: false
  isLoading: false
  loadMore: () => void
  page: 1
  totalCount: 0
}
/** Result shape returned by `useList` with normal options. */
interface UseListResult<T extends Rec> {
  data: T[]
  hasMore: boolean
  isLoading: boolean
  loadMore: () => void
  page: number
  totalCount: number
}
export type { ListWhere, SkipListResult, UseListOptions, UseListResult, WhereGroup }
export { DEFAULT_PAGE_SIZE, useList, useOwnRows }
