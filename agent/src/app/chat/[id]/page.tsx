/* oxlint-disable promise/prefer-await-to-then */
'use client'
import type { Id } from '@a/be-agent/model'
import type { SyntheticEvent } from 'react'
import { api } from '@a/be-agent'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from '@a/ui/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@a/ui/components/ai-elements/message'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@a/ui/components/ai-elements/reasoning'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@a/ui/components/ai-elements/sources'
import { Tool, ToolContent, ToolHeader } from '@a/ui/components/ai-elements/tool'
import { useMutation, useQuery } from 'convex/react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
interface ChatMessageData {
  _id: string
  content: string
  isComplete: boolean
  parts?: MessagePart[]
  role: string
  streamingContent?: string
}
interface MessagePart {
  args?: string
  result?: string
  snippet?: string
  status?: string
  text?: string
  title?: string
  toolCallId?: string
  toolName?: string
  type: string
  url?: string
}
interface SessionTask {
  _id: string
  description: string
  status: string
}
interface SessionTodo {
  _id: string
  content: string
  priority: string
  status: string
}
interface SessionTokenUsage {
  count: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
}
const mapToolState = (status?: string) => {
    if (status === 'success') return 'output-available' as const
    if (status === 'error') return 'output-error' as const
    return 'input-available' as const
  },
  parseDelegateTaskId = (result?: string): Id<'tasks'> | null => {
    if (!result) return null
    try {
      const parsed: unknown = JSON.parse(result)
      if (typeof parsed === 'object' && parsed !== null && 'taskId' in parsed)
        return (parsed as { taskId: string }).taskId as Id<'tasks'>
      return null
    } catch {
      return null
    }
  },
  messagePartKey = ({ messageId, part, prefix }: { messageId: string; part: MessagePart; prefix: string }) => {
    if (part.toolCallId) return `${prefix}-${part.toolCallId}`
    if (part.type === 'source') return `${prefix}-${messageId}-${part.url ?? ''}-${part.title ?? ''}`
    return `${prefix}-${messageId}-${part.toolName ?? ''}-${part.text ?? ''}-${part.args ?? ''}`
  },
  splitMessageParts = ({ parts }: { parts: MessagePart[] }) => {
    const reasoningParts: MessagePart[] = [],
      sourceParts: MessagePart[] = [],
      toolParts: MessagePart[] = []
    for (const p of parts)
      if (p.type === 'reasoning') reasoningParts.push(p)
      else if (p.type === 'tool-call') toolParts.push(p)
      else if (p.type === 'source') sourceParts.push(p)
    return { reasoningParts, sourceParts, toolParts }
  },
  WorkerStreamPanel = ({ taskId }: { taskId: Id<'tasks'> }) => {
    const task = useQuery(api.tasks.getOwnedTaskStatus, { taskId }),
      workerMessages = useQuery(api.messages.listMessages, task?.threadId ? { threadId: task.threadId } : 'skip')
    if (!task) return null
    const statusClass =
      task.status === 'completed'
        ? 'text-green-600'
        : task.status === 'failed'
          ? 'text-destructive'
          : task.status === 'running'
            ? 'animate-pulse text-chart-1'
            : 'text-muted-foreground'
    return (
      <section className='space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3'>
        <div className='flex items-center justify-between text-xs'>
          <span className='font-medium text-foreground'>{task.description}</span>
          <span className={`font-mono uppercase ${statusClass}`}>{task.status}</span>
        </div>
        {workerMessages && workerMessages.length > 0 ? (
          <div className='space-y-3 border-l-2 border-border/40 pl-3'>
            {workerMessages.map(wm => {
              if (wm.role === 'system') return null
              const wmContent = wm.isComplete ? wm.content : (wm.streamingContent ?? wm.content)
              if (!wmContent) return null
              return (
                <div className='text-sm text-foreground' key={wm._id}>
                  <MessageResponse>{wmContent}</MessageResponse>
                </div>
              )
            })}
          </div>
        ) : task.status === 'running' ? (
          <p className='animate-pulse text-xs text-muted-foreground'>Worker processing...</p>
        ) : null}
      </section>
    )
  },
  ChatMessageRow = ({ message }: { message: ChatMessageData }) => {
    const parts = message.parts ?? [],
      isAssistantStreaming = !message.isComplete && message.role === 'assistant',
      textContent = message.isComplete ? message.content : (message.streamingContent ?? message.content),
      { reasoningParts, sourceParts, toolParts } = splitMessageParts({ parts })
    return (
      <Message from={message.role as 'assistant' | 'system' | 'user'} key={message._id}>
        <MessageContent>
          {reasoningParts.map(p => (
            <Reasoning
              isStreaming={isAssistantStreaming ? p === reasoningParts.at(-1) : undefined}
              key={messagePartKey({
                messageId: message._id,
                part: p,
                prefix: 'reasoning'
              })}>
              <ReasoningTrigger />
              <ReasoningContent>{p.text ?? ''}</ReasoningContent>
            </Reasoning>
          ))}
          {textContent ? (
            message.role === 'user' ? (
              <p className='whitespace-pre-wrap'>{textContent}</p>
            ) : (
              <MessageResponse>{textContent}</MessageResponse>
            )
          ) : null}
          {toolParts.map(p => {
            const delegateTaskId = p.toolName === 'delegate' ? parseDelegateTaskId(p.result) : null
            return (
              <div
                key={messagePartKey({
                  messageId: message._id,
                  part: p,
                  prefix: 'tool'
                })}>
                <Tool>
                  <ToolHeader state={mapToolState(p.status)} title={p.toolName} type='tool-invocation' />
                  <ToolContent>
                    {p.args ? <pre className='overflow-x-auto rounded-md bg-muted/50 p-2 text-xs'>{p.args}</pre> : null}
                    {p.result ? (
                      <pre className='overflow-x-auto rounded-md bg-muted/50 p-2 text-xs'>{p.result}</pre>
                    ) : null}
                  </ToolContent>
                </Tool>
                {delegateTaskId ? <WorkerStreamPanel taskId={delegateTaskId} /> : null}
              </div>
            )
          })}
          {sourceParts.length > 0 ? (
            <Sources>
              <SourcesTrigger count={sourceParts.length} />
              <SourcesContent>
                {sourceParts.map(p => (
                  <Source
                    href={p.url}
                    key={messagePartKey({
                      messageId: message._id,
                      part: p,
                      prefix: 'source'
                    })}
                    title={p.title}
                  />
                ))}
              </SourcesContent>
            </Sources>
          ) : null}
        </MessageContent>
      </Message>
    )
  },
  SidePanel = ({
    isTyping,
    tasks,
    todos,
    tokenUsage
  }: {
    isTyping: boolean
    tasks: SessionTask[] | undefined
    todos: SessionTodo[] | undefined
    tokenUsage: SessionTokenUsage | undefined
  }) => (
    <aside className='space-y-3 overflow-y-auto'>
      <details className='rounded-lg border p-3' data-testid='typing-panel' open>
        <summary className='cursor-pointer text-sm font-medium'>Typing</summary>
        <p className='mt-2 text-sm text-muted-foreground'>
          {isTyping ? <span className='animate-pulse text-chart-1'>Agent is typing...</span> : 'Idle'}
        </p>
      </details>
      <details className='rounded-lg border p-3' data-testid='task-panel' open>
        <summary className='cursor-pointer text-sm font-medium'>Tasks</summary>
        {tasks === undefined ? <p className='mt-2 text-sm text-muted-foreground'>Loading tasks...</p> : null}
        {tasks?.length === 0 ? <p className='mt-2 text-sm text-muted-foreground'>No background tasks</p> : null}
        {tasks && tasks.length > 0 ? (
          <div className='mt-2 space-y-2'>
            {tasks.map(t => (
              <article className='rounded-sm border bg-muted/50 p-2 text-xs' key={t._id}>
                <p className='font-medium'>{t.description}</p>
                <p className='mt-1 font-mono text-muted-foreground uppercase'>{t.status}</p>
              </article>
            ))}
          </div>
        ) : null}
      </details>
      <details className='rounded-lg border p-3' data-testid='todo-panel' open>
        <summary className='cursor-pointer text-sm font-medium'>Todos</summary>
        {todos === undefined ? <p className='mt-2 text-sm text-muted-foreground'>Loading todos...</p> : null}
        {todos?.length === 0 ? <p className='mt-2 text-sm text-muted-foreground'>No todos</p> : null}
        {todos && todos.length > 0 ? (
          <ul className='mt-2 space-y-2'>
            {todos.map(t => (
              <li className='rounded-sm border bg-muted/50 p-2 text-xs' key={t._id}>
                <p className='font-medium'>{t.content}</p>
                <p className='mt-1 text-muted-foreground'>
                  {t.status} - {t.priority}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </details>
      <details className='rounded-lg border p-3' data-testid='token-usage-panel' open>
        <summary className='cursor-pointer text-sm font-medium'>Token usage</summary>
        {tokenUsage === undefined ? <p className='mt-2 text-sm text-muted-foreground'>Loading token usage...</p> : null}
        {tokenUsage ? (
          <dl className='mt-2 grid grid-cols-2 gap-1 text-xs'>
            <dt className='text-muted-foreground'>Input</dt>
            <dd className='text-right'>{tokenUsage.inputTokens}</dd>
            <dt className='text-muted-foreground'>Output</dt>
            <dd className='text-right'>{tokenUsage.outputTokens}</dd>
            <dt className='text-muted-foreground'>Total</dt>
            <dd className='text-right font-medium'>{tokenUsage.totalTokens}</dd>
            <dt className='text-muted-foreground'>Events</dt>
            <dd className='text-right'>{tokenUsage.count}</dd>
          </dl>
        ) : null}
      </details>
    </aside>
  ),
  ChatPage = () => {
    const [draft, setDraft] = useState(''),
      [sending, setSending] = useState(false),
      [submitError, setSubmitError] = useState(''),
      params = useParams<{ id: string }>(),
      id = params.id as Id<'session'>,
      tokenUsageQuery = (api as { tokenUsage: { getTokenUsage: unknown } }).tokenUsage.getTokenUsage,
      session = useQuery(api.sessions.getSession, { sessionId: id }),
      messages = useQuery(api.messages.listMessages, session ? { threadId: session.threadId } : 'skip') as
        | ChatMessageData[]
        | undefined,
      tasks = useQuery(api.tasks.listTasks, { sessionId: id }) as SessionTask[] | undefined,
      todos = useQuery(api.todos.listTodos, { sessionId: id }) as SessionTodo[] | undefined,
      tokenUsage = useQuery(tokenUsageQuery as never, { sessionId: id }) as SessionTokenUsage | undefined,
      submitMessage = useMutation(api.orchestrator.submitMessage),
      lastMessage = messages && messages.length > 0 ? (messages.at(-1) ?? null) : null,
      isTyping = lastMessage?.role === 'assistant' && !lastMessage.isComplete,
      submitChatMessage = async ({ content, sessionId }: { content: string; sessionId: Id<'session'> }) => {
        setSending(true)
        try {
          await submitMessage({ content, sessionId })
          setDraft('')
          setSubmitError('')
        } catch (error) {
          setSubmitError(String(error))
        } finally {
          setSending(false)
        }
      },
      runSubmitChatMessage = ({ content, sessionId }: { content: string; sessionId: Id<'session'> }) => {
        submitChatMessage({ content, sessionId }).catch(() => undefined)
      },
      onSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault()
        const content = draft.trim()
        if (!content || sending || !session) return
        runSubmitChatMessage({ content, sessionId: session._id })
      }
    if (!session || messages === undefined) return <main className='p-8 text-muted-foreground'>Loading...</main>
    return (
      <main className='mx-auto flex h-screen w-full max-w-6xl flex-col gap-4 p-4 md:p-6'>
        <header className='flex shrink-0 items-center justify-between'>
          <h1 className='text-lg font-semibold'>{session.title ?? 'Untitled Session'}</h1>
          <nav className='flex items-center gap-2'>
            <Link className='rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent' href='/'>
              Sessions
            </Link>
            <Link className='rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent' href='/settings'>
              Settings
            </Link>
          </nav>
        </header>
        <div className='grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]'>
          <Conversation aria-live='polite' className='rounded-lg border'>
            <ConversationContent className='gap-6'>
              {messages.length === 0 ? (
                <ConversationEmptyState description='Send a message to start talking to the agent' />
              ) : null}
              {submitError ? (
                <p className='text-sm text-destructive' data-testid='submit-error'>
                  {submitError}
                </p>
              ) : null}
              {messages.map(m => (
                <ChatMessageRow key={m._id} message={m} />
              ))}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <SidePanel isTyping={isTyping} tasks={tasks} todos={todos} tokenUsage={tokenUsage} />
        </div>
        <form className='flex shrink-0 gap-2' onSubmit={onSubmit}>
          <input
            className='flex-1 rounded-lg border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none'
            disabled={sending}
            onChange={event => setDraft(event.target.value)}
            placeholder='Message the agent'
            value={draft}
          />
          <button
            className='rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60'
            disabled={sending}
            type='submit'>
            Send
          </button>
        </form>
      </main>
    )
  }
export default ChatPage
