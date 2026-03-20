import type { Id } from '@a/be-convex/model'
import type { UIMessage } from 'ai'

import { api } from '@a/be-convex'
import Client from '@a/fe/chat-client'
import { toUIMessage } from '@a/fe/ui-message'
import { getToken, isAuthenticated } from '@noboil/convex/next'
import { fetchQuery } from 'convex/nextjs'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
const tryFetch = async <T,>(fn: () => Promise<T>): Promise<null | T> => {
    try {
      return await fn()
    } catch {
      return null
    }
  },
  toUIMessages = (messages: { _id: string; parts: unknown; role: 'assistant' | 'system' | 'user' }[]): UIMessage[] =>
    messages.map(m => toUIMessage({ id: m._id, parts: m.parts, role: m.role })),
  Page = async ({ params }: { params: Promise<{ id: string }> }) => {
    await connection()
    const { id } = await params,
      chatId = id as Id<'chat'>,
      token = await getToken(),
      authed = await isAuthenticated(),
      opts = token ? { token } : {}
    if (authed) {
      const chat = await tryFetch(async () => fetchQuery(api.chat.read, { id: chatId }, opts))
      if (chat) {
        const messages = await fetchQuery(api.message.list, { chatId }, opts)
        return (
          <Suspense fallback={null}>
            <Client chatId={id} initialMessages={toUIMessages(messages)} />
          </Suspense>
        )
      }
    }
    const pubChat = await tryFetch(async () => fetchQuery(api.chat.pubRead, { id: chatId }))
    if (pubChat) {
      const messages = (await fetchQuery(api.message.pubList, { chatId })) as {
        _id: string
        parts: unknown
        role: 'assistant' | 'system' | 'user'
      }[]
      return (
        <Suspense fallback={null}>
          <Client chatId={id} initialMessages={toUIMessages(messages)} readOnly />
        </Suspense>
      )
    }
    redirect('/')
  }
export default Page
