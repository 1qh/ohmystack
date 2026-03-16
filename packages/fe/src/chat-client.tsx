'use client'

import type { UIMessage } from 'ai'

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
  initialMessages: UIMessage[]
  readOnly?: boolean
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

const getToolDisplayName = (toolName: string): string => {
    if (toolName === 'getWeather') return 'Weather'
    return toolName
  },
  SparklesAvatar = () => (
    <div className='-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border'>
      <SparklesIcon className='size-4' />
    </div>
  ),
  ThinkingMessage = () => (
    <div className='flex w-full items-start gap-3' data-role='assistant' data-testid='thinking-indicator'>
      <div className='-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border'>
        <SparklesIcon className='size-4 animate-pulse' />
      </div>
      <Shimmer>Thinking</Shimmer>
    </div>
  ),
  ToolApprovalButtons = ({ onApprove, onDeny }: { onApprove: () => void; onDeny: () => void }) => (
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
  ),
  ToolPartDisplay = ({
    addToolApprovalResponse,
    partKey,
    toolPart
  }: {
    addToolApprovalResponse: (args: { approved: boolean; id: string; reason?: string }) => void
    partKey: string
    toolPart: ToolPart
  }) => {
    const approvalId = toolPart.approval?.id ?? toolPart.toolCallId,
      { state, toolName } = toolPart,
      displayName = getToolDisplayName(toolName)

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
  },
  MessageItem = ({
    addToolApprovalResponse,
    isLast,
    message,
    status
  }: {
    addToolApprovalResponse: (args: { approved: boolean; id: string; reason?: string }) => void
    isLast: boolean
    message: UIMessage
    status: string
  }) => {
    const isUser = message.role === 'user',
      isStreaming = status === 'streaming' && isLast,
      parts = message.parts as MessagePart[],
      textParts: TextPart[] = [],
      toolParts: ToolPart[] = []

    for (const part of parts)
      if (part.type === 'text') textParts.push(part as TextPart)
      else if (part.type.startsWith('tool-')) toolParts.push(part as ToolPart)

    const text = textParts.map(p => p.text).join(''),
      hasToolOutput = toolParts.some(p => p.output !== undefined || p.state === 'output-available')

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
      <div
        className='is-assistant flex w-full items-start justify-start gap-3'
        data-role='assistant'
        data-testid='message'>
        <SparklesAvatar />
        <div className='flex max-w-full min-w-0 flex-1 flex-col gap-2'>
          {toolParts.map(tp => (
            <ToolPartDisplay
              addToolApprovalResponse={addToolApprovalResponse}
              key={tp.toolCallId}
              partKey={tp.toolCallId}
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
  },
  ChatClient = ({ chatId, initialMessages, readOnly = false }: ClientProps) => {
    const searchParams = useSearchParams(),
      query = searchParams.get('query'),
      hasAppendedQueryRef = useRef(false),
      { addToolApprovalResponse, messages, sendMessage, status, stop } = useChat({
        id: chatId,
        messages: initialMessages,
        sendAutomaticallyWhen: ({ messages: currentMessages }) => {
          const lastMessage = currentMessages.at(-1)
          if (!lastMessage) return false
          return lastMessage.parts.some(
            part => 'state' in part && part.state === 'approval-responded' && 'approval' in part
          )
        },
        transport: new DefaultChatTransport({
          api: '/api/chat',
          prepareSendMessagesRequest: request => {
            const lastMessage = request.messages.at(-1),
              isToolApprovalFlow =
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
      }),
      handleToolApprovalResponse = (args: { approved: boolean; id: string; reason?: string }) => {
        addToolApprovalResponse(args)
      },
      isRunning = status === 'streaming' || status === 'submitted',
      showThinking = useMemo(() => {
        if (status !== 'submitted') return false
        const hasApprovalResponded = messages.some(msg =>
          msg.parts.some(part => 'state' in part && part.state === 'approval-responded')
        )
        return !hasApprovalResponded
      }, [status, messages]),
      handleSubmit = (text: string) => {
        if (!text.trim() || status !== 'ready') return
        sendMessage({ parts: [{ text, type: 'text' }], role: 'user' })
      },
      handleAbort = () => {
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
      <div className='flex flex-1 flex-col overflow-hidden'>
        <Conversation className='flex-1'>
          <ConversationContent className='mx-auto max-w-3xl'>
            {messages.length === 0 ? (
              <ConversationEmptyState
                data-testid='empty-state'
                description='Send a message to start a conversation'
                icon={emptyStateIcon}
                title='Start a conversation'
              />
            ) : (
              messages.map((m, i) => (
                <MessageItem
                  addToolApprovalResponse={handleToolApprovalResponse}
                  isLast={i === messages.length - 1}
                  key={m.id}
                  message={m}
                  status={status}
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
