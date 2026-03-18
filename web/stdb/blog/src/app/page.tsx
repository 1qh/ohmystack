'use client'

import { tables } from '@a/be-spacetimedb/spacetimedb'
import LoadMoreButton from '@a/fe/load-more-button'
import SearchInput from '@a/fe/search-input'
import { useList, useOwnRows } from '@noboil/spacetimedb/react'
import { useCallback, useMemo, useState } from 'react'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'

import { Create, List } from './common'

const Page = () => {
  const [allBlogs, isReady] = useTable(tables.blog),
    { identity } = useSpacetimeDB(),
    blogs = useOwnRows(allBlogs, identity ? (b: (typeof allBlogs)[number]) => b.userId.isEqual(identity) : null),
    [removedIds, setRemovedIds] = useState<Set<number>>(() => new Set()),
    [query, setQuery] = useState(''),
    { data, hasMore, isLoading, loadMore } = useList(blogs, isReady, {
      search: { debounceMs: 200, fields: ['title', 'content', 'tags'], query },
      sort: { direction: 'desc', field: 'id' },
      where: { or: [{ published: true }, { own: true }] }
    }),
    filtered = useMemo(() => {
      if (removedIds.size === 0) return data
      const out: typeof data = []
      for (const b of data) if (!removedIds.has(b.id)) out.push(b)
      return out
    }, [data, removedIds]),
    handleRemove = useCallback((id: number) => {
      setRemovedIds(prev => new Set(prev).add(id))
    }, [])
  return (
    <div data-testid='crud-dynamic-page'>
      <Create />
      <SearchInput
        className='mb-4'
        data-testid='blog-search-input'
        onValueChange={setQuery}
        placeholder='Search blogs...'
        value={query}
      />
      <List blogs={filtered} onRemove={handleRemove} />
      {!query && hasMore && !isLoading ? <LoadMoreButton onLoadMore={loadMore} /> : null}
    </div>
  )
}

export default Page
