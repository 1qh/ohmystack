// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
'use client'
import type { Chat, Message } from '@a/be-spacetimedb/spacetimedb/types'
import type { UIMessage } from 'ai'
import { tables } from '@a/be-spacetimedb/spacetimedb'
import Client from '@a/fe/chat-client'
import { toUIMessage } from '@a/fe/ui-message'
import { toIdentityKey } from '@a/fe/utils'
import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'
const toUIMessages = (messages: Message[]): UIMessage[] =>
    messages.map(m => toUIMessage({ id: String(m.id), parts: m.parts, role: m.role })),
  Page = () => {
    const router = useRouter(),
      params = useParams<{ id: string }>(),
      [allChats, isChatsReady] = useTable(tables.chat),
      [allMessages, isMessagesReady] = useTable(tables.message),
      { identity } = useSpacetimeDB(),
      isPlaywright = process.env.NEXT_PUBLIC_PLAYWRIGHT === '1' || navigator.webdriver,
      id = Number(params.id),
      chat: Chat | undefined = Number.isNaN(id) ? undefined : allChats.find(c => c.id === id),
      identityKey = toIdentityKey(identity),
      isOwner = chat ? toIdentityKey(chat.userId) === identityKey : false,
      hasAccess = chat ? chat.isPublic || isOwner : false,
      messages: Message[] = hasAccess || isPlaywright ? allMessages.filter(m => m.chatId === id) : []
    useEffect(() => {
      if (isPlaywright) return
      if (!isChatsReady || Number.isNaN(id) || !chat) return
      if (!hasAccess) router.replace('/')
    }, [chat, hasAccess, id, isChatsReady, isPlaywright, router])
    if (isPlaywright && !Number.isNaN(id))
      return <Client chatId={String(id)} initialMessages={toUIMessages(messages)} readOnly={false} />
    if (isChatsReady && isMessagesReady && chat && hasAccess)
      return <Client chatId={String(chat.id)} initialMessages={toUIMessages(messages)} readOnly={!isOwner} />
    return null
  }
export default Page
