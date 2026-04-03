'use client'
import { tables } from '@a/be-spacetimedb/spacetimedb'
import { Spinner } from '@a/ui/spinner'
import { useInfiniteList, useOwnRows } from '@noboil/spacetimedb/react'
import { Check } from 'lucide-react'
import { useEffect, useReducer } from 'react'
import { useInView } from 'react-intersection-observer'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'
import { Create, List } from '../common'
const Page = () => {
  const { inView, ref } = useInView()
  const [allBlogs, isReady] = useTable(tables.blog)
  const { identity } = useSpacetimeDB()
  const blogs = useOwnRows(allBlogs, identity ? (b: (typeof allBlogs)[number]) => b.userId.isEqual(identity) : null)
  const [stableReady, markReady] = useReducer(() => true, false)
  useEffect(() => {
    if (isReady || allBlogs.length > 0) markReady()
  }, [allBlogs.length, isReady])
  const { data, hasMore, isLoading, loadMore } = useInfiniteList(blogs, stableReady, {
    sort: { direction: 'desc', field: 'id' },
    where: { or: [{ published: true }, { own: true }] }
  })
  const showLoading = isLoading
  const showLoadMore = !isLoading && hasMore
  const showExhausted = !(isLoading || hasMore) && data.length > 0
  useEffect(() => {
    if (inView && hasMore && !isLoading) loadMore()
  }, [hasMore, inView, isLoading, loadMore])
  return (
    <div data-testid='crud-pagination-page'>
      <Create />
      <List blogs={data} />
      <Spinner className={showLoading ? 'm-auto' : 'sr-only'} data-testid='loading-more' />
      <p className={showLoadMore ? 'h-8' : 'absolute size-0 overflow-hidden'} data-testid='load-more-trigger' ref={ref} />
      <Check
        className={showExhausted ? 'm-auto animate-[fadeOut_2s_forwards] text-green-500' : 'sr-only'}
        data-testid='pagination-exhausted'
      />
    </div>
  )
}
export default Page
