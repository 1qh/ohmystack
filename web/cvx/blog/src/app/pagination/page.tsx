'use client'
import { api } from '@a/be-convex'
import { Spinner } from '@a/ui/spinner'
import { useInfiniteList } from '@noboil/convex/react'
import { Check } from 'lucide-react'
import { Create, List } from '../common'
const Page = () => {
  const { data, hasMore, isLoadingMore, sentinelRef, status } = useInfiniteList(api.blog.list, {
    where: { or: [{ published: true }, { own: true }] }
  })
  return (
    <div data-testid='crud-pagination-page'>
      <Create />
      <List blogs={data} />
      {isLoadingMore ? (
        <Spinner className='m-auto' data-testid='loading-more' />
      ) : hasMore ? (
        <div
          className='h-8'
          data-testid='load-more-trigger'
          ref={el => {
            sentinelRef.current = el
          }}
        />
      ) : status === 'Exhausted' ? (
        <Check className='m-auto animate-[fadeOut_2s_forwards] text-primary' data-testid='pagination-exhausted' />
      ) : null}
    </div>
  )
}
export default Page
