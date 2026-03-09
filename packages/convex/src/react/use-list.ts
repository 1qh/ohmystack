/** biome-ignore-all lint/style/noProcessEnv: env detection */
'use client'

import type { PaginatedQueryArgs, PaginatedQueryReference } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'

import { usePaginatedQuery } from 'convex/react'
import { useEffect, useMemo, useRef } from 'react'

import type { PendingMutation } from './optimistic-store'

import { trackSubscription, untrackSubscription, updateSubscription, updateSubscriptionData } from './devtools'
import { usePendingMutations } from './optimistic-store'

type ListItems<F extends PaginatedQueryReference> = FunctionReturnType<F>['page']

type ListRest<F extends PaginatedQueryReference> =
  PaginatedQueryArgs<F> extends Record<string, never>
    ? [args?: PaginatedQueryArgs<F>, options?: UseListOptions]
    : [args: PaginatedQueryArgs<F>, options?: UseListOptions]
type Rec = Record<string, unknown>

interface UseListOptions {
  optimistic?: boolean
  pageSize?: number
}

const classifyPending = (pending: PendingMutation[]) => {
    const deleteIds = new Set<string>(),
      updates = new Map<string, Rec>(),
      creates: Rec[] = []
    for (const p of pending)
      if (p.type === 'delete') deleteIds.add(p.id)
      else if (p.type === 'update') {
        const prev = updates.get(p.id)
        updates.set(p.id, prev ? { ...prev, ...p.args } : p.args)
      } else
        creates.push({
          ...p.args,
          __optimistic: true,
          _creationTime: p.timestamp,
          _id: p.tempId,
          updatedAt: p.timestamp
        })

    return { creates, deleteIds, updates }
  },
  isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production',
  DEFAULT_PAGE_SIZE = 50,
  /** Applies pending optimistic creates, updates, and deletes to a list of items. */
  applyOptimistic = <T extends Rec>(items: T[], pending: PendingMutation[]): T[] => {
    if (pending.length === 0) return items
    const { creates, deleteIds, updates } = classifyPending(pending)
    let result = items
    if (deleteIds.size > 0) result = result.filter(i => !deleteIds.has((i as Rec)._id as string))
    if (updates.size > 0)
      result = result.map(i => {
        const patch = updates.get((i as Rec)._id as string)
        return patch ? ({ ...i, ...patch, _id: (i as Rec)._id } as T) : i
      })
    if (creates.length > 0) result = [...(creates.toReversed() as T[]), ...result]
    return result
  },
  /**
   * Paginated list hook with optimistic update support and devtools integration.
   * @param query A paginated Convex query reference
   * @example
   * ```tsx
   * const { items, loadMore, isDone } = useList(api.blog.list, { where: { published: true } })
   * ```
   */
  useList = <F extends PaginatedQueryReference>(query: F, ...rest: ListRest<F>) => {
    const queryArgs = (rest[0] ?? {}) as unknown as PaginatedQueryArgs<F>,
      pageSize = rest[1]?.pageSize ?? DEFAULT_PAGE_SIZE,
      isOptimistic = rest[1]?.optimistic !== false,
      { loadMore, results, status } = usePaginatedQuery(query, queryArgs, { initialNumItems: pageSize }),
      pending = usePendingMutations(),
      subIdRef = useRef<number>(0)

    // biome-ignore lint/correctness/useExhaustiveDependencies: subscribe lifecycle is intentionally one-time
    useEffect(() => {
      if (!isDev) return
      const queryName = typeof query === 'string' ? query : ((query as { _name?: string })._name ?? 'unknown')
      subIdRef.current = trackSubscription(queryName, queryArgs as Record<string, unknown>)
      const id = subIdRef.current
      return () => untrackSubscription(id)
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
      if (!(isDev && subIdRef.current)) return
      const devStatus =
        status === 'LoadingFirstPage'
          ? 'loading'
          : status === 'Exhausted' || status === 'CanLoadMore'
            ? 'loaded'
            : 'loading'
      updateSubscription(subIdRef.current, devStatus)
    }, [status])

    useEffect(() => {
      if (!(isDev && subIdRef.current)) return
      const preview = results.length > 0 ? JSON.stringify(results[0]).slice(0, 200) : ''
      updateSubscriptionData(subIdRef.current, results, preview)
    }, [results])

    const items = useMemo(
      () => (isOptimistic ? applyOptimistic(results as Rec[], pending) : results),
      [isOptimistic, pending, results]
    )

    return {
      isDone: status === 'Exhausted',
      items: items as ListItems<F>,
      loadMore: (n?: number) => loadMore(n ?? pageSize),
      status
    }
  },
  useOwnRows = <T extends Rec>(
    rows: readonly T[],
    isOwn: ((row: T) => boolean) | null | undefined
  ): (T & { own: boolean })[] =>
    useMemo(() => {
      const out: (T & { own: boolean })[] = []
      for (const row of rows) out.push({ ...row, own: isOwn ? isOwn(row) : false })
      return out
    }, [rows, isOwn])

export type { UseListOptions }
export { applyOptimistic, DEFAULT_PAGE_SIZE, useList, useOwnRows }
