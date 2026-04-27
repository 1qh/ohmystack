'use client'
/* oxlint-disable eslint-plugin-react(forbid-component-props), eslint(no-underscore-dangle) */
import { api } from '@a/be-convex'
import { Input } from '@a/ui/input'
import Link from 'next/link'
import { useList } from 'noboil/convex/react'
import { useMemo, useState } from 'react'
interface ChatItem {
  _id: string
  title: string
}
const Page = () => {
  const { data: allChats } = useList(api.chat.list, { where: { isPublic: true } })
  const chatsTyped = allChats as ChatItem[]
  const [query, setQuery] = useState('')
  const chats = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return chatsTyped
    return chatsTyped.filter(c => c.title.toLowerCase().includes(q))
  }, [chatsTyped, query])
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
            <Link className='block py-3 hover:bg-muted/50' data-testid='public-chat-item' href={`/${c._id}`} key={c._id}>
              <p className='font-medium'>{c.title}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
export default Page
