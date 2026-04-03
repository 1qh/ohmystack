'use client'
import type { UIMessage } from 'ai'
import { cn } from '@a/ui'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from '@a/ui/ai-elements/conversation'
import { Shimmer } from '@a/ui/ai-elements/shimmer'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@a/ui/ai-elements/tool'
import { Button } from '@a/ui/button'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { CheckIcon, MessageSquareIcon, SparklesIcon, XIcon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { createElement, useEffect, useMemo, useRef } from 'react'
import { Streamdown } from 'streamdown'
import ChatInput from './chat-input'
interface ClientProps {
  chatId: string
  conversationClassName?: string
  conversationContentClassName?: string
  emptyStateDescription?: string
  emptyStateTitle?: string
  initialMessages: UIMessage[]
  readOnly?: boolean
  rootClassName?: string
  toolDisplayNames?: Readonly<Record<string, string>>
}
type MessagePart = TextPart | ToolPart | { [key: string]: unknown; type: string }
interface TextPart {
  text: string
  type: 'text'
}
interface ToolPart {
  approval?: { approved?: boolean; id?: string }
  errorText?: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  state?: string
  toolCallId: string
  toolName: string
  type: string
}
const SparklesAvatar = () => (
  <div className='-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border'>
    <SparklesIcon className='size-4' />
  </div>
)
const ThinkingMessage = () => (
  <div className='flex w-full items-start gap-3' data-role='assistant' data-testid='thinking-indicator'>
    <div className='-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border'>
      <SparklesIcon className='size-4 animate-pulse' />
    </div>
    <Shimmer as='p'>Thinking</Shimmer>
  </div>
)
const ToolApprovalButtons = ({ onApprove, onDeny }: { onApprove: () => void; onDeny: () => void }) => (
  <div className='flex items-center justify-end gap-2 border-t px-4 py-3'>
    <Button
      className='text-muted-foreground hover:bg-muted hover:text-foreground'
      data-testid='deny-button'
      onClick={onDeny}
      size='sm'
      variant='ghost'>
      <XIcon className='mr-1 size-3' />
      Deny
    </Button>
    <Button data-testid='approve-button' onClick={onApprove} size='sm'>
      <CheckIcon className='mr-1 size-3' />
      Allow
    </Button>
  </div>
)
const ToolPartDisplay = ({
  addToolApprovalResponse,
  partKey,
  toolDisplayNames,
  toolPart
}: {
  addToolApprovalResponse: (args: { approved: boolean; id: string; reason?: string }) => void
  partKey: string
  toolDisplayNames?: Readonly<Record<string, string>>
  toolPart: ToolPart
}) => {
  const approvalId = toolPart.approval?.id ?? toolPart.toolCallId
  const { state, toolName } = toolPart
  const displayName = toolDisplayNames?.[toolName] ?? toolName
  if (state === 'output-available' || state === 'output-denied')
    return (
      <Tool className='w-full' defaultOpen key={partKey}>
        <ToolHeader state={state as 'output-available'} title={displayName} type='tool-invocation' />
        <ToolContent>
          {toolPart.input ? <ToolInput input={toolPart.input} /> : null}
          <ToolOutput errorText={toolPart.errorText} output={toolPart.output} />
        </ToolContent>
      </Tool>
    )
  if (state === 'approval-requested' && toolPart.input)
    return (
      <div data-testid='tool-approval-card' key={partKey}>
        <Tool className='w-full' defaultOpen>
          <ToolHeader state='approval-requested' title={displayName} type='tool-invocation' />
          <ToolContent>
            <ToolInput input={toolPart.input} />
            <ToolApprovalButtons
              onApprove={() => {
                addToolApprovalResponse({ approved: true, id: approvalId })
              }}
              onDeny={() => {
                addToolApprovalResponse({ approved: false, id: approvalId, reason: 'User denied' })
              }}
            />
          </ToolContent>
        </Tool>
      </div>
    )
  if (state === 'approval-responded' || state === 'input-available' || state === 'input-streaming')
    return (
      <Tool className='w-full' key={partKey}>
        <ToolHeader state={state as 'input-available'} title={displayName} type='tool-invocation' />
        <ToolContent>{toolPart.input ? <ToolInput input={toolPart.input} /> : null}</ToolContent>
      </Tool>
    )
  return null
}
const MessageItem = ({
  addToolApprovalResponse,
  isLast,
  message,
  status,
  toolDisplayNames
}: {
  addToolApprovalResponse: (args: { approved: boolean; id: string; reason?: string }) => void
  isLast: boolean
  message: UIMessage
  status: string
  toolDisplayNames?: Readonly<Record<string, string>>
}) => {
  const isUser = message.role === 'user'
  const isStreaming = status === 'streaming' && isLast
  const parts = message.parts as MessagePart[]
  const textParts: TextPart[] = []
  const toolParts: ToolPart[] = []
  for (const part of parts)
    if (part.type === 'text') textParts.push(part as TextPart)
    else if (part.type.startsWith('tool-')) toolParts.push(part as ToolPart)
  const text = textParts.map(p => p.text).join('')
  const hasToolOutput = toolParts.some(p => p.output !== undefined || p.state === 'output-available')
  if (!(isUser || text || hasToolOutput) && toolParts.length === 0) return null
  if (isUser)
    return (
      <div className='is-user flex w-full items-start justify-end gap-3' data-role='user' data-testid='message'>
        <div className='max-w-[80%] rounded-2xl bg-[#006cff] px-4 py-2 text-white'>
          <span className='whitespace-pre-wrap'>{text}</span>
        </div>
      </div>
    )
  return (
    <div className='is-assistant flex w-full items-start justify-start gap-3' data-role='assistant' data-testid='message'>
      <SparklesAvatar />
      <div className='flex max-w-full min-w-0 flex-1 flex-col gap-2'>
        {toolParts.map(tp => (
          <ToolPartDisplay
            addToolApprovalResponse={addToolApprovalResponse}
            key={tp.toolCallId}
            partKey={tp.toolCallId}
            toolDisplayNames={toolDisplayNames}
            toolPart={tp}
          />
        ))}
        {text ? (
          <div className='text-foreground'>
            <Streamdown className='size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0'>{text}</Streamdown>
            {isStreaming ? <span className='ml-1 inline-block animate-pulse'>▊</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
const ChatClient = ({
  chatId,
  conversationClassName,
  conversationContentClassName,
  emptyStateDescription = 'Send a message to start a conversation',
  emptyStateTitle = 'Start a conversation',
  initialMessages,
  readOnly = false,
  rootClassName,
  toolDisplayNames
}: ClientProps) => {
  const searchParams = useSearchParams()
  const query = searchParams.get('query')
  const hasAppendedQueryRef = useRef(false)
  const { addToolApprovalResponse, messages, sendMessage, status, stop } = useChat({
    id: chatId,
    messages: initialMessages,
    sendAutomaticallyWhen: ({ messages: currentMessages }) => {
      const lastMessage = currentMessages.at(-1)
      if (!lastMessage) return false
      return lastMessage.parts.some(part => 'state' in part && part.state === 'approval-responded' && 'approval' in part)
    },
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest: request => {
        const lastMessage = request.messages.at(-1)
        const isToolApprovalFlow =
          lastMessage?.role !== 'user' ||
          request.messages.some(msg =>
            msg.parts.some(part => {
              const { state } = part as { state?: string }
              return state === 'approval-responded' || state === 'output-denied'
            })
          )
        return {
          body: {
            id: request.id,
            ...(isToolApprovalFlow ? { messages: request.messages } : { message: lastMessage })
          }
        }
      }
    })
  })
  const handleToolApprovalResponse = (args: { approved: boolean; id: string; reason?: string }) => {
    addToolApprovalResponse(args)
  }
  const isRunning = status === 'streaming' || status === 'submitted'
  const showThinking = useMemo(() => {
    if (status !== 'submitted') return false
    const hasApprovalResponded = messages.some(msg =>
      msg.parts.some(part => 'state' in part && part.state === 'approval-responded')
    )
    return !hasApprovalResponded
  }, [status, messages])
  const handleSubmit = (text: string) => {
    if (!text.trim() || status !== 'ready') return
    sendMessage({ parts: [{ text, type: 'text' }], role: 'user' })
  }
  const handleAbort = () => {
    stop()
  }
  useEffect(() => {
    if (query && !hasAppendedQueryRef.current) {
      hasAppendedQueryRef.current = true
      sendMessage({ parts: [{ text: query, type: 'text' }], role: 'user' })
      globalThis.history.replaceState({}, '', `/${chatId}`)
    }
  }, [query, sendMessage, chatId])
  const emptyStateIcon = createElement(MessageSquareIcon, { className: 'size-8' })
  return (
    <div className={cn('flex flex-1 flex-col overflow-hidden', rootClassName)}>
      <Conversation className={cn('flex-1', conversationClassName)}>
        <ConversationContent className={cn('mx-auto max-w-3xl', conversationContentClassName)}>
          {messages.length === 0 ? (
            <ConversationEmptyState
              data-testid='empty-state'
              description={emptyStateDescription}
              icon={emptyStateIcon}
              title={emptyStateTitle}
            />
          ) : (
            messages.map((m, i) => (
              <MessageItem
                addToolApprovalResponse={handleToolApprovalResponse}
                isLast={i === messages.length - 1}
                key={m.id}
                message={m}
                status={status}
                toolDisplayNames={toolDisplayNames}
              />
            ))
          )}
          {showThinking ? <ThinkingMessage /> : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {readOnly ? null : <ChatInput isBusy={isRunning} onAbort={handleAbort} onSubmit={handleSubmit} />}
    </div>
  )
}
export type { ClientProps }
export default ChatClient
