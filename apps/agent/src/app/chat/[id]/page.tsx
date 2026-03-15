'use client'

import { api } from '@a/be-agent'
import type { Id } from '@a/be-agent/model'
import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

const ChatPage = () => {
  const bottomRef = useRef<HTMLDivElement>(null),
    [draft, setDraft] = useState(''),
    [sending, setSending] = useState(false),
    { isAuthenticated, isLoading } = useConvexAuth(),
    router = useRouter(),
    isTestMode = process.env.NEXT_PUBLIC_CONVEX_TEST_MODE === 'true',
    params = useParams<{ id: string }>(),
    id = params.id as Id<'session'>,
    session = useQuery(api.sessions.getSession, { sessionId: id }),
    messages = useQuery(api.messages.listMessages, session ? { threadId: session.threadId } : 'skip'),
    submitMessage = useMutation(api.orchestrator.submitMessage),
    onSubmit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const content = draft.trim()
      if (!content || sending || !session) return
      setSending(true)
      try {
        await submitMessage({ content, sessionId: session._id })
        setDraft('')
      } finally {
        setSending(false)
      }
    }

  useEffect(() => {
    if (isTestMode || isLoading || isAuthenticated) return
    router.replace('/login')
  }, [isAuthenticated, isLoading, isTestMode, router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!isTestMode && (isLoading || !isAuthenticated)) return <main className='p-8'>Loading...</main>
  if (!session) return <main className='p-8'>Loading...</main>
  if (messages === undefined) return <main className='p-8'>Loading...</main>

  return (
    <main className='mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 p-4 md:p-6'>
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

      <section aria-live='polite' className='flex-1 space-y-3 overflow-y-auto rounded-lg border p-3 md:p-4' role='log'>
        {messages.length === 0 ? <p className='text-sm text-gray-500'>No messages yet.</p> : null}
        {messages.map(m => {
          const isUser = m.role === 'user',
            isSystem = m.role === 'system',
            bg = isUser ? 'bg-blue-50' : isSystem ? 'bg-yellow-50' : 'bg-gray-50',
            parts = (m.parts ?? []) as Array<{ args?: string; result?: string; snippet?: string; status?: string; text?: string; title?: string; toolCallId?: string; toolName?: string; type: string; url?: string }>
          return (
            <article className={`rounded-lg border p-3 ${bg}`} key={m._id}>
              <div className='mb-1 flex items-center gap-2 text-xs uppercase text-gray-500'>
                <span>{m.role}</span>
                {!m.isComplete ? <span className='animate-pulse text-blue-500'>●</span> : null}
              </div>
              <p className='whitespace-pre-wrap text-sm'>{m.isComplete ? m.content : (m.streamingContent ?? m.content)}</p>
              {parts.length > 0 ? (
                <div className='mt-2 space-y-1'>
                  {parts.map((p, i) => {
                    if (p.type === 'tool-call') {
                      const statusLabel = p.status === 'success' ? '✓ Completed' : p.status === 'error' ? '✗ Error' : '⟳ Running'
                      return (
                        <details className='rounded border bg-white p-2 text-xs' key={p.toolCallId ?? i}>
                          <summary className='cursor-pointer font-medium'>
                            {p.toolName} — {statusLabel}
                          </summary>
                          {p.args ? <pre className='mt-1 overflow-x-auto text-gray-600'>{p.args}</pre> : null}
                          {p.result ? <pre className='mt-1 overflow-x-auto text-gray-600'>{p.result}</pre> : null}
                        </details>
                      )
                    }
                    if (p.type === 'reasoning') {
                      return (
                        <details className='rounded border bg-purple-50 p-2 text-xs' key={`r-${i}`}>
                          <summary className='cursor-pointer font-medium text-purple-700'>Thinking</summary>
                          <p className='mt-1 whitespace-pre-wrap text-gray-600'>{p.text}</p>
                        </details>
                      )
                    }
                    if (p.type === 'source') {
                      return (
                        <a className='block rounded border bg-green-50 p-2 text-xs hover:underline' href={p.url} key={`s-${i}`} rel='noopener noreferrer' target='_blank'>
                          {p.title}{p.snippet ? ` — ${p.snippet}` : ''}
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

      <form className='flex gap-2' onSubmit={onSubmit}>
        <input
          className='flex-1 rounded-lg border px-3 py-2'
          disabled={sending}
          onChange={event => setDraft(event.target.value)}
          placeholder='Message the agent'
          value={draft}
        />
        <button className='rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60' disabled={sending} type='submit'>
          Send
        </button>
      </form>
    </main>
  )
}

export default ChatPage
