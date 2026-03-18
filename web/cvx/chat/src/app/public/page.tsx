'use client'

import { api } from '@a/be-convex'
import { useList } from '@noboil/convex/react'
import Link from 'next/link'

const Page = () => {
  const { items: chats } = useList(api.chat.list, { where: { isPublic: true } })
  return (
    <div className='mx-auto max-w-3xl p-4' data-testid='public-chats-page'>
      <h1 className='mb-4 text-xl font-semibold'>Public Chats</h1>
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
