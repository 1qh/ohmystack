'use client'
import { tables } from '@a/be-spacetimedb/spacetimedb'
import { Input } from '@a/ui/input'
import { useList, useOwnRows } from 'noboil/spacetimedb/react'
import { useMemo, useState } from 'react'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'
import { BannerAdmin, BannerDisplay, Create, PollList } from './common'
const Page = () => {
  const [allPolls, isReady] = useTable(tables.poll)
  const { identity } = useSpacetimeDB()
  const mine = useOwnRows(allPolls, identity ? (p: (typeof allPolls)[number]) => p.userId.isEqual(identity) : null)
  const [query, setQuery] = useState('')
  const q = query.toLowerCase()
  const filtered = useMemo(() => (q ? mine.filter(p => p.question.toLowerCase().includes(q)) : mine), [mine, q])
  const { data: polls } = useList(filtered, isReady, { sort: { direction: 'desc', field: 'id' } })
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
      <PollList polls={polls} />
      <BannerAdmin />
    </div>
  )
}
export default Page
