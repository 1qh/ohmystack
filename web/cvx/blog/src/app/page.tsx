'use client'
import { api } from '@a/be-convex'
import LoadMoreButton from '@a/fe/load-more-button'
import SearchInput from '@a/fe/search-input'
import { useList } from '@noboil/convex/react'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Create, List } from './common'
const Page = () => {
  const { data, loadMore, status } = useList(api.blog.list, { where: { or: [{ published: true }, { own: true }] } }),
    [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set()),
    [query, setQuery] = useState(''),
    deferredQuery = useDeferredValue(query.toLowerCase()),
    handleRemove = useCallback((id: string) => {
      setRemovedIds(prev => new Set(prev).add(id))
    }, []),
    filtered = useMemo(
      () =>
        data.filter(b => {
          if (removedIds.has(b._id)) return false
          if (!deferredQuery) return true
          return (
            b.title.toLowerCase().includes(deferredQuery) ||
            b.content.toLowerCase().includes(deferredQuery) ||
            b.tags?.some((t: string) => t.toLowerCase().includes(deferredQuery))
          )
        }),
      [deferredQuery, data, removedIds]
    )
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
      {!deferredQuery && status === 'CanLoadMore' ? <LoadMoreButton onLoadMore={loadMore} /> : null}
    </div>
  )
}
export default Page
