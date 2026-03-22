/* oxlint-disable promise/prefer-await-to-then */
'use client'
import type { ComponentProps } from 'react'
import { cn } from '@a/ui'
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
  conversationsLabel?: string
  deleteActionProps?: Omit<ComponentProps<typeof SidebarMenuAction>, 'children' | 'onClick' | 'type'>
  getThreadId: (thread: TThread) => TId
  getTitle?: (thread: TThread) => string
  groupLabelProps?: Omit<ComponentProps<typeof SidebarGroupLabel>, 'children'>
  groupProps?: Omit<ComponentProps<typeof SidebarGroup>, 'children'>
  headerClassName?: string
  menuButtonClassName?: string
  menuButtonProps?: Omit<ComponentProps<typeof SidebarMenuButton>, 'children' | 'isActive' | 'onClick'>
  menuItemProps?: Omit<ComponentProps<typeof SidebarMenuItem>, 'children'>
  menuProps?: Omit<ComponentProps<typeof SidebarMenu>, 'children'>
  newChatButtonProps?: Omit<ComponentProps<typeof Button>, 'children'>
  newChatLabel?: string
  onDelete: (threadId: TId) => Promise<void>
  publicChatsButtonProps?: Omit<ComponentProps<typeof Button>, 'children'>
  publicChatsLabel?: string
  publicPath?: string
  rootProps?: Omit<ComponentProps<typeof Sidebar>, 'children' | 'side'>
  sidebarContentProps?: Omit<ComponentProps<typeof SidebarContent>, 'children'>
  threads: TThread[]
  untitledThreadLabel?: string
}
interface ThreadBase {
  title?: string
}
const ChatSidebar = <TThread extends ThreadBase, TId extends number | string>({
  basePath,
  conversationsLabel = 'Conversations',
  deleteActionProps,
  getThreadId,
  getTitle,
  groupLabelProps,
  groupProps,
  headerClassName,
  menuButtonClassName,
  menuButtonProps,
  menuItemProps,
  menuProps,
  newChatButtonProps,
  newChatLabel = 'New Chat',
  onDelete,
  publicChatsButtonProps,
  publicChatsLabel = 'Public Chats',
  publicPath = '/public',
  rootProps,
  sidebarContentProps,
  threads,
  untitledThreadLabel = 'Untitled'
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
    <Sidebar {...rootProps} side='left'>
      <SidebarHeader className={cn('gap-2', headerClassName)}>
        <Link href={rootPath}>
          <Button
            {...newChatButtonProps}
            className={cn('w-full', newChatButtonProps?.className)}
            data-testid='new-chat-button'>
            <MessageSquarePlusIcon className='mr-2 size-4' />
            {newChatLabel}
          </Button>
        </Link>
        <Link href={publicPath}>
          <Button
            {...publicChatsButtonProps}
            className={cn('w-full', publicChatsButtonProps?.className)}
            data-testid='public-chats-button'
            variant='outline'>
            <GlobeIcon className='mr-2 size-4' />
            {publicChatsLabel}
          </Button>
        </Link>
      </SidebarHeader>
      <SidebarContent {...sidebarContentProps}>
        <SidebarGroup {...groupProps}>
          <SidebarGroupLabel {...groupLabelProps}>{conversationsLabel}</SidebarGroupLabel>
          <SidebarMenu {...menuProps} data-testid='thread-list'>
            {threads.map(t => {
              const id = getThreadId(t)
              return (
                <SidebarMenuItem {...menuItemProps} data-testid='thread-item' key={String(id)}>
                  <SidebarMenuButton
                    {...menuButtonProps}
                    className={cn('group/item', menuButtonClassName, menuButtonProps?.className)}
                    isActive={params.id === String(id)}
                    onClick={() => router.push(`${basePath}/${id}`)}>
                    <MessageSquareIcon className='size-4' />
                    <span className='flex-1 truncate'>{getTitle ? getTitle(t) : (t.title ?? untitledThreadLabel)}</span>
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    {...deleteActionProps}
                    data-testid='delete-thread-button'
                    onClick={e => {
                      const deletingThread = handleDelete(e, id)
                      deletingThread.catch(() => undefined)
                    }}
                    showOnHover={deleteActionProps?.showOnHover ?? true}
                    type='button'>
                    <Trash2Icon className='size-3' />
                  </SidebarMenuAction>
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
