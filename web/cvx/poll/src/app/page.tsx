'use client'
/* oxlint-disable no-underscore-dangle -- Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
import { api } from '@a/be-convex'
import LoadMoreButton from '@a/fe/load-more-button'
import SearchInput from '@a/fe/search-input'
import { useList } from 'noboil/convex/react'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import type { Poll } from './common'
import { BannerAdmin, BannerDisplay, Create, PollList } from './common'
const Page = () => {
  const { data, hasMore, loadMore } = useList(api.poll.list, {})
  const polls = data as Poll[]
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query.toLowerCase())
  const onRemove = useCallback((id: string) => {
    setRemovedIds(prev => new Set(prev).add(id))
  }, [])
  const filtered = useMemo(
    () =>
      polls.filter(p => {
        if (removedIds.has(p._id)) return false
        if (!deferred) return true
        return p.question.toLowerCase().includes(deferred)
      }),
    [polls, deferred, removedIds]
  )
  return (
    <div className='mx-auto max-w-2xl space-y-5 p-6' data-testid='poll-page'>
      <Create />
      <BannerDisplay />
      <h1 className='text-2xl font-semibold'>Polls</h1>
      <SearchInput data-testid='poll-search-input' onValueChange={setQuery} placeholder='Search polls…' value={query} />
      <PollList onRemove={onRemove} polls={filtered} />
      {hasMore ? <LoadMoreButton data-testid='poll-load-more' onLoadMore={() => loadMore(10)} /> : null}
      <BannerAdmin />
    </div>
  )
}
export default Page
