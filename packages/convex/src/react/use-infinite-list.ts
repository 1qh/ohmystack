'use client'

import type { PaginatedQueryArgs, PaginatedQueryReference } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'

import { useCallback, useEffect, useRef } from 'react'

import { DEFAULT_PAGE_SIZE, useList } from './use-list'

interface InfiniteListOptions {
  pageSize?: number
  rootMargin?: string
  threshold?: number
}

type InfiniteListRest<F extends PaginatedQueryReference> =
  PaginatedQueryArgs<F> extends Record<string, never>
    ? [args?: PaginatedQueryArgs<F>, options?: InfiniteListOptions]
    : [args: PaginatedQueryArgs<F>, options?: InfiniteListOptions]

type ListItems<F extends PaginatedQueryReference> = FunctionReturnType<F>['page']

/** Wraps useList with an IntersectionObserver sentinel for automatic infinite scroll pagination. */
const useInfiniteList = <F extends PaginatedQueryReference>(query: F, ...rest: InfiniteListRest<F>) => {
  const [args, opts] = rest as [PaginatedQueryArgs<F> | undefined, InfiniteListOptions | undefined],
    { isDone, items, loadMore, status } = (useList as (...a: unknown[]) => ReturnType<typeof useList>)(query, args ?? {}, {
      pageSize: opts?.pageSize
    }),
    sentinelRef = useRef<HTMLElement | null>(null),
    observerRef = useRef<IntersectionObserver | null>(null),
    isLoadingMore = status === 'LoadingMore',
    canLoad = status === 'CanLoadMore',
    pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE,
    // eslint-disable-next-line @eslint-react/no-unnecessary-use-callback
    handleIntersect = useCallback(
      (entries: IntersectionObserverEntry[]) => {
        const [entry] = entries
        if (entry?.isIntersecting && canLoad && !isLoadingMore) loadMore(pageSize)
      },
      [canLoad, isLoadingMore, loadMore, pageSize]
    )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(handleIntersect, {
      rootMargin: opts?.rootMargin ?? '200px',
      threshold: opts?.threshold ?? 0
    })
    observerRef.current.observe(el)
    return () => observerRef.current?.disconnect()
  }, [handleIntersect, opts?.rootMargin, opts?.threshold])

  return {
    hasMore: !isDone,
    isLoadingMore,
    items: items as ListItems<F>,
    loadMore: (n?: number) => loadMore(n ?? pageSize),
    sentinelRef,
    status
  }
}

export type { InfiniteListOptions }
export { useInfiniteList }
