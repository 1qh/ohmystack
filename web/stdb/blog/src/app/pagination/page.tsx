'use client'
import { tables } from '@a/be-spacetimedb/spacetimedb'
import { Spinner } from '@a/ui/spinner'
import { useInfiniteList, useOwnRows } from '@noboil/spacetimedb/react'
import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useInView } from 'react-intersection-observer'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'
import { Create, List } from '../common'
type Status = 'CanLoadMore' | 'Exhausted' | 'Idle' | 'LoadingMore'
const Page = () => {
  const { inView, ref } = useInView(),
    [allBlogs, isReady] = useTable(tables.blog),
    { identity } = useSpacetimeDB(),
    blogs = useOwnRows(allBlogs, identity ? (b: (typeof allBlogs)[number]) => b.userId.isEqual(identity) : null),
    wasReadyRef = useRef(false)
  if (isReady || allBlogs.length > 0) wasReadyRef.current = true
  const stableReady = wasReadyRef.current,
    { data, hasMore, isLoading, loadMore } = useInfiniteList(blogs, stableReady, {
      sort: { direction: 'desc', field: 'id' },
      where: { or: [{ published: true }, { own: true }] }
    }),
    rawStatus: Status = isLoading ? 'LoadingMore' : hasMore ? 'CanLoadMore' : data.length > 0 ? 'Exhausted' : 'Idle',
    [stableStatus, setStableStatus] = useState<Status>('Idle')
  useEffect(() => {
    if (rawStatus === 'Exhausted' || rawStatus === 'CanLoadMore') setStableStatus(rawStatus)
    else if (rawStatus === 'LoadingMore' && stableStatus === 'Idle') setStableStatus('LoadingMore')
  }, [rawStatus, stableStatus])
  useEffect(() => {
    if (inView && hasMore && !isLoading) loadMore()
  }, [hasMore, inView, isLoading, loadMore])
  return (
    <div data-testid='crud-pagination-page'>
      <Create />
      <List blogs={data} />
      {stableStatus === 'LoadingMore' ? (
        <Spinner className='m-auto' data-testid='loading-more' />
      ) : stableStatus === 'CanLoadMore' ? (
        <p className='h-8' data-testid='load-more-trigger' ref={ref} />
      ) : stableStatus === 'Exhausted' ? (
        <Check className='m-auto animate-[fadeOut_2s_forwards] text-green-500' data-testid='pagination-exhausted' />
      ) : null}
    </div>
  )
}
export default Page
