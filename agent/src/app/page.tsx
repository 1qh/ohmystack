/* oxlint-disable promise/prefer-await-to-then */
'use client'
import { api } from '@a/be-agent'
import { useMutation, useQuery } from 'convex/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
const SessionListPage = () => {
  const sessions = useQuery(api.sessions.listSessions, {}),
    createSession = useMutation(api.sessions.createSession),
    router = useRouter(),
    createNewSession = async () => {
      const { sessionId } = await createSession({})
      router.push(`/chat/${sessionId}`)
    },
    handleNew = () => {
      createNewSession().catch(() => undefined)
    }
  if (!sessions) return <main className='p-8'>Loading...</main>
  if (sessions.length === 0)
    return (
      <main className='flex min-h-screen items-center justify-center p-8'>
        <button className='rounded-lg bg-blue-600 px-6 py-3 text-white' onClick={handleNew} type='button'>
          New Chat
        </button>
      </main>
    )
  return (
    <main className='mx-auto max-w-2xl p-8'>
      <div className='mb-6 flex items-center justify-between'>
        <h1 className='text-2xl font-bold'>Sessions</h1>
        <div className='flex items-center gap-2'>
          <Link className='rounded-lg border px-3 py-2 text-sm' href='/settings'>
            Settings
          </Link>
          <button className='rounded-lg bg-blue-600 px-4 py-2 text-white' onClick={handleNew} type='button'>
            New
          </button>
        </div>
      </div>
      <div className='space-y-2'>
        {sessions.map(s => (
          <button
            className='w-full rounded-lg border p-4 text-left hover:bg-gray-50'
            key={s._id}
            onClick={() => router.push(`/chat/${s._id}`)}
            type='button'>
            <div className='font-medium'>{s.title ?? 'Untitled'}</div>
            <div className='text-sm text-gray-500'>{new Date(s.lastActivityAt).toLocaleString()}</div>
          </button>
        ))}
      </div>
    </main>
  )
}
export default SessionListPage
