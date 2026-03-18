'use client'

import { tables } from '@a/be-spacetimedb/spacetimedb'
import { Input } from '@a/ui/input'
import { useList } from '@noboil/spacetimedb/react'
import Link from 'next/link'
import { useState } from 'react'
import { useTable } from 'spacetimedb/react'

const Page = () => {
  const [allChats, isReady] = useTable(tables.chat),
    [query, setQuery] = useState(''),
    { data: chats } = useList(allChats, isReady, {
      search: { debounceMs: 200, fields: ['title'], query },
      sort: { direction: 'desc', field: 'updatedAt' },
      where: { isPublic: true }
    })
  return (
    <div className='mx-auto max-w-3xl p-4' data-testid='public-chats-page'>
      <h1 className='mb-4 text-xl font-semibold'>Public Chats</h1>
      <Input
        className='mb-4'
        onChange={e => setQuery(e.target.value)}
        placeholder='Search public chats...'
        value={query}
      />
      {chats.length === 0 ? (
        <p className='text-muted-foreground'>No public chats yet</p>
      ) : (
        <div className='divide-y'>
          {chats.map(c => (
            <Link className='block py-3 hover:bg-muted/50' data-testid='public-chat-item' href={`/${c.id}`} key={c.id}>
              <p className='font-medium'>{c.title}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default Page
