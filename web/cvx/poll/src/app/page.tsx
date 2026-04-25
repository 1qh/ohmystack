'use client'
import { api } from '@a/be-convex'
import { Input } from '@a/ui/input'
import { useList } from 'noboil/convex/react'
import { useMemo, useState } from 'react'
import type { Poll } from './common'
import { BannerAdmin, BannerDisplay, Create, PollList } from './common'
const Page = () => {
  const { data, hasMore, loadMore } = useList(api.poll.list, {})
  const polls = data as Poll[]
  const [query, setQuery] = useState('')
  const q = query.toLowerCase()
  const filtered = useMemo(() => (q ? polls.filter(p => p.question.toLowerCase().includes(q)) : polls), [polls, q])
  return (
    <div className='mx-auto max-w-2xl space-y-5 p-6' data-testid='poll-page'>
      <Create />
      <BannerDisplay />
      <h1 className='text-2xl font-semibold'>Polls</h1>
      <Input
        data-testid='poll-search-input'
        onChange={e => setQuery(e.target.value)}
        placeholder='Search polls…'
        value={query}
      />
      <PollList polls={filtered} />
      {hasMore ? (
        <button
          className='block w-full rounded-md border py-2 text-sm text-muted-foreground hover:bg-muted'
          data-testid='poll-load-more'
          onClick={() => loadMore(10)}
          type='button'>
          Load more
        </button>
      ) : null}
      <BannerAdmin />
    </div>
  )
}
export default Page
