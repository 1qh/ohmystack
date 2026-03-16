/* oxlint-disable promise/prefer-await-to-then */
'use client'

import { Button } from '@a/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem
} from '@a/ui/sidebar'
import { GlobeIcon, MessageSquareIcon, MessageSquarePlusIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

interface ChatSidebarProps<TThread extends ThreadBase, TId extends number | string> {
  basePath: string
  getThreadId: (thread: TThread) => TId
  getTitle?: (thread: TThread) => string
  onDelete: (threadId: TId) => Promise<void>
  threads: TThread[]
}

interface ThreadBase {
  title?: string
}

const ChatSidebar = <TThread extends ThreadBase, TId extends number | string>({
  basePath,
  getThreadId,
  getTitle,
  onDelete,
  threads
}: ChatSidebarProps<TThread, TId>) => {
  const router = useRouter(),
    params = useParams(),
    rootPath = basePath || '/',
    handleDelete = async (e: React.KeyboardEvent | React.MouseEvent, threadId: TId) => {
      e.stopPropagation()
      await onDelete(threadId)
      if (params.id === String(threadId)) router.push(rootPath)
    }

  return (
    <Sidebar side='left'>
      <SidebarHeader className='gap-2'>
        <Link href={rootPath}>
          <Button className='w-full' data-testid='new-chat-button'>
            <MessageSquarePlusIcon className='mr-2 size-4' />
            New Chat
          </Button>
        </Link>
        <Link href='/public'>
          <Button className='w-full' data-testid='public-chats-button' variant='outline'>
            <GlobeIcon className='mr-2 size-4' />
            Public Chats
          </Button>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Conversations</SidebarGroupLabel>
          <SidebarMenu data-testid='thread-list'>
            {threads.map(t => {
              const id = getThreadId(t)
              return (
                <SidebarMenuItem data-testid='thread-item' key={String(id)}>
                  <SidebarMenuButton
                    className='group/item'
                    isActive={params.id === String(id)}
                    onClick={() => router.push(`${basePath}/${id}`)}>
                    <MessageSquareIcon className='size-4' />
                    <span className='flex-1 truncate'>{getTitle ? getTitle(t) : (t.title ?? 'Untitled')}</span>
                    <SidebarMenuAction
                      data-testid='delete-thread-button'
                      onClick={e => {
                        const deletingThread = handleDelete(e, id)
                        deletingThread.catch(() => undefined)
                      }}
                      showOnHover
                      type='button'>
                      <Trash2Icon className='size-3' />
                    </SidebarMenuAction>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

export default ChatSidebar
