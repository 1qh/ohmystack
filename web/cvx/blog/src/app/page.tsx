'use client'
/* oxlint-disable forbid-component-props, no-underscore-dangle -- shadcn/Tailwind pattern requires className/style on shared components / Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
import type { FunctionReturnType } from 'convex/server'
import { api } from '@a/be-convex'
import LoadMoreButton from '@a/fe/load-more-button'
import SearchInput from '@a/fe/search-input'
import { useList } from 'noboil/convex/react'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Create, List } from './common'
type Blog = FunctionReturnType<typeof api.blog.list>['page'][number]
const Page = () => {
  const { data, loadMore, status } = useList(api.blog.list, { where: { or: [{ published: true }, { own: true }] } })
  const blogs = data as Blog[]
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.toLowerCase())
  const handleRemove = useCallback((id: string) => {
    setRemovedIds(prev => new Set(prev).add(id))
  }, [])
  const filtered = useMemo(
    () =>
      blogs.filter(b => {
        if (removedIds.has(b._id)) return false
        if (!deferredQuery) return true
        return (
          b.title.toLowerCase().includes(deferredQuery) ||
          b.content.toLowerCase().includes(deferredQuery) ||
          (b.tags?.some(t => t.toLowerCase().includes(deferredQuery)) ?? false)
        )
      }),
    [deferredQuery, blogs, removedIds]
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
