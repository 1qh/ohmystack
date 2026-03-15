'use client'

import { api } from '@a/be-agent'
import type { Id } from '@a/be-agent/model'
import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type MessagePart = {
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

const ChatPage = () => {
  const bottomRef = useRef<HTMLDivElement>(null),
    [draft, setDraft] = useState(''),
    [sending, setSending] = useState(false),
    [submitError, setSubmitError] = useState(''),
    params = useParams<{ id: string }>(),
    id = params.id as Id<'session'>,
    session = useQuery(api.sessions.getSession, { sessionId: id }),
    messages = useQuery(api.messages.listMessages, session ? { threadId: session.threadId } : 'skip'),
    tasks = useQuery(api.tasks.listTasks, { sessionId: id }),
    todos = useQuery(api.todos.listTodos, { sessionId: id }),
    tokenUsage = useQuery(api.tokenUsage.getTokenUsage, { sessionId: id }),
    submitMessage = useMutation(api.orchestrator.submitMessage),
    lastMessage = messages && messages.length > 0 ? messages[messages.length - 1] : null,
    isTyping = !!lastMessage && lastMessage.role === 'assistant' && !lastMessage.isComplete,
    onSubmit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const content = draft.trim()
      if (!content || sending || !session) return
      setSending(true)
      try {
        await submitMessage({ content, sessionId: session._id })
        setDraft('')
        setSubmitError('')
      } catch (submitErr) {
        setSubmitError(String(submitErr))
      } finally {
        setSending(false)
      }
    }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!session) return <main className='p-8'>Loading...</main>
  if (messages === undefined) return <main className='p-8'>Loading...</main>

  return (
    <main className='mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 p-4 md:p-6'>
      <div className='flex items-center justify-between'>
        <h1 className='text-lg font-semibold'>{session.title ?? 'Untitled Session'}</h1>
        <div className='flex items-center gap-2'>
          <Link className='rounded-lg border px-3 py-2 text-sm' href='/'>
            Sessions
          </Link>
          <Link className='rounded-lg border px-3 py-2 text-sm' href='/settings'>
            Settings
          </Link>
        </div>
      </div>

      <div className='grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]'>
        <section aria-live='polite' className='space-y-3 overflow-y-auto rounded-lg border p-3 md:p-4' role='log'>
          {submitError ? (
            <p className='text-sm text-red-500' data-testid='submit-error'>
              {submitError}
            </p>
          ) : null}
          {messages.length === 0 ? <p className='text-sm text-gray-500'>No messages yet.</p> : null}
          {messages.map(m => {
            const isUser = m.role === 'user',
              isSystem = m.role === 'system',
              bg = isUser ? 'bg-blue-50' : isSystem ? 'bg-yellow-50' : 'bg-gray-50',
              parts = (m.parts ?? []) as MessagePart[]
            return (
              <article className={`rounded-lg border p-3 ${bg}`} key={m._id}>
                <div className='mb-1 flex items-center gap-2 text-xs uppercase text-gray-500'>
                  <span>{m.role}</span>
                  {m.isComplete ? null : <span className='animate-pulse text-blue-500'>●</span>}
                </div>
                <p className='whitespace-pre-wrap text-sm'>
                  {m.isComplete ? m.content : (m.streamingContent ?? m.content)}
                </p>
                {parts.length > 0 ? (
                  <div className='mt-2 space-y-1'>
                    {parts.map((p, i) => {
                      if (p.type === 'tool-call') {
                        const statusLabel =
                          p.status === 'success' ? 'Completed' : p.status === 'error' ? 'Error' : 'Running'
                        return (
                          <details className='rounded border bg-white p-2 text-xs' key={p.toolCallId ?? i}>
                            <summary className='cursor-pointer font-medium'>
                              {p.toolName} - {statusLabel}
                            </summary>
                            {p.args ? <pre className='mt-1 overflow-x-auto text-gray-600'>{p.args}</pre> : null}
                            {p.result ? <pre className='mt-1 overflow-x-auto text-gray-600'>{p.result}</pre> : null}
                          </details>
                        )
                      }
                      if (p.type === 'reasoning') {
                        return (
                          <details className='rounded border bg-slate-50 p-2 text-xs' key={`r-${i}`}>
                            <summary className='cursor-pointer font-medium text-slate-700'>Thinking</summary>
                            <p className='mt-1 whitespace-pre-wrap text-gray-600'>{p.text}</p>
                          </details>
                        )
                      }
                      if (p.type === 'source') {
                        return (
                          <a
                            className='block rounded border bg-emerald-50 p-2 text-xs hover:underline'
                            href={p.url}
                            key={`s-${i}`}
                            rel='noopener noreferrer'
                            target='_blank'>
                            {p.title}
                            {p.snippet ? ` - ${p.snippet}` : ''}
                          </a>
                        )
                      }
                      return null
                    })}
                  </div>
                ) : null}
              </article>
            )
          })}
          <div ref={bottomRef} />
        </section>

        <aside className='space-y-3'>
          <details className='rounded-lg border p-3' data-testid='typing-panel' open>
            <summary className='cursor-pointer text-sm font-medium'>Typing</summary>
            <p className='mt-2 text-sm text-gray-600'>{isTyping ? 'Agent is typing...' : 'Idle'}</p>
          </details>

          <details className='rounded-lg border p-3' data-testid='task-panel' open>
            <summary className='cursor-pointer text-sm font-medium'>Tasks</summary>
            {tasks === undefined ? <p className='mt-2 text-sm text-gray-500'>Loading tasks...</p> : null}
            {tasks && tasks.length === 0 ? <p className='mt-2 text-sm text-gray-500'>No background tasks</p> : null}
            {tasks && tasks.length > 0 ? (
              <div className='mt-2 space-y-2'>
                {tasks.map(t => (
                  <article className='rounded border bg-gray-50 p-2 text-xs' key={t._id}>
                    <p className='font-medium'>{t.description}</p>
                    <p className='mt-1 uppercase text-gray-500'>{t.status}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </details>

          <details className='rounded-lg border p-3' data-testid='todo-panel' open>
            <summary className='cursor-pointer text-sm font-medium'>Todos</summary>
            {todos === undefined ? <p className='mt-2 text-sm text-gray-500'>Loading todos...</p> : null}
            {todos && todos.length === 0 ? <p className='mt-2 text-sm text-gray-500'>No todos</p> : null}
            {todos && todos.length > 0 ? (
              <ul className='mt-2 space-y-2'>
                {todos.map(t => (
                  <li className='rounded border bg-gray-50 p-2 text-xs' key={t._id}>
                    <p className='font-medium'>{t.content}</p>
                    <p className='mt-1 text-gray-500'>
                      {t.status} - {t.priority}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </details>

          <details className='rounded-lg border p-3' data-testid='token-usage-panel' open>
            <summary className='cursor-pointer text-sm font-medium'>Token usage</summary>
            {tokenUsage === undefined ? <p className='mt-2 text-sm text-gray-500'>Loading token usage...</p> : null}
            {tokenUsage ? (
              <dl className='mt-2 grid grid-cols-2 gap-1 text-xs'>
                <dt className='text-gray-500'>Input</dt>
                <dd className='text-right'>{tokenUsage.inputTokens}</dd>
                <dt className='text-gray-500'>Output</dt>
                <dd className='text-right'>{tokenUsage.outputTokens}</dd>
                <dt className='text-gray-500'>Total</dt>
                <dd className='text-right font-medium'>{tokenUsage.totalTokens}</dd>
                <dt className='text-gray-500'>Events</dt>
                <dd className='text-right'>{tokenUsage.count}</dd>
              </dl>
            ) : null}
          </details>
        </aside>
      </div>

      <form className='flex gap-2' onSubmit={onSubmit}>
        <input
          className='flex-1 rounded-lg border px-3 py-2'
          disabled={sending}
          onChange={event => setDraft(event.target.value)}
          placeholder='Message the agent'
          value={draft}
        />
        <button
          className='rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60'
          disabled={sending}
          type='submit'>
          Send
        </button>
      </form>
    </main>
  )
}

export default ChatPage
