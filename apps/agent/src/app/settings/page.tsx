'use client'

import { api } from '@a/be-agent'
import type { Id } from '@a/be-agent/model'
import { useMutation, useQuery } from 'convex/react'
import Link from 'next/link'
import type { FormEvent } from 'react'
import { useState } from 'react'

type McpServerRow = {
  _id: Id<'mcpServers'>
  hasAuthHeaders: boolean
  name: string
  url: string
}

const formatCreateError = (error: unknown) => {
  const message = String(error).toLowerCase()
  if (message.includes('name_taken')) return 'Server name is already taken.'
  if (message.includes('blocked_url')) return 'This URL is blocked by SSRF protection.'
  if (message.includes('invalid_url_protocol')) return 'Only http:// or https:// URLs are allowed.'
  if (message.includes('url_required')) return 'URL is required.'
  if (message.includes('name_required')) return 'Name is required.'
  return 'Failed to add MCP server. Please try again.'
}

const SettingsPage = () => {
  const servers = useQuery(api.mcp.list, {}),
    createServer = useMutation(api.mcp.create),
    removeServer = useMutation(api.mcp.rm),
    [name, setName] = useState(''),
    [url, setUrl] = useState(''),
    [authHeaders, setAuthHeaders] = useState(''),
    [formError, setFormError] = useState(''),
    [isSaving, setIsSaving] = useState(false),
    [deletingId, setDeletingId] = useState<Id<'mcpServers'> | null>(null),
    onSubmit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const nextName = name.trim(),
        nextUrl = url.trim(),
        nextAuthHeaders = authHeaders.trim()
      if (!nextName) {
        setFormError('Name is required.')
        return
      }
      if (!nextUrl) {
        setFormError('URL is required.')
        return
      }
      setIsSaving(true)
      try {
        await createServer({
          authHeaders: nextAuthHeaders || undefined,
          isEnabled: true,
          name: nextName,
          transport: 'http',
          url: nextUrl
        })
        setName('')
        setUrl('')
        setAuthHeaders('')
        setFormError('')
      } catch (createError) {
        setFormError(formatCreateError(createError))
      } finally {
        setIsSaving(false)
      }
    },
    onDelete = async (id: Id<'mcpServers'>) => {
      setDeletingId(id)
      try {
        await removeServer({ id })
      } finally {
        setDeletingId(null)
      }
    }

  if (!servers) return <main className='p-8'>Loading...</main>

  let serverCount = 0
  for (const server of servers) if (server) serverCount += 1

  return (
    <main className='mx-auto max-w-2xl space-y-4 p-8'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-bold'>Settings</h1>
        <Link className='rounded-lg border px-3 py-2 text-sm' href='/'>
          Sessions
        </Link>
      </div>
      <section className='space-y-4 rounded-lg border p-4'>
        <h2 className='font-medium'>MCP Servers</h2>
        <form className='space-y-2' onSubmit={onSubmit}>
          <input
            className='w-full rounded-lg border px-3 py-2 text-sm'
            onChange={event => setName(event.target.value)}
            placeholder='Name'
            value={name}
          />
          <input
            className='w-full rounded-lg border px-3 py-2 text-sm'
            onChange={event => setUrl(event.target.value)}
            placeholder='URL'
            value={url}
          />
          <textarea
            className='min-h-24 w-full rounded-lg border px-3 py-2 text-sm'
            onChange={event => setAuthHeaders(event.target.value)}
            placeholder='Auth headers (optional JSON)'
            value={authHeaders}
          />
          {formError ? <p className='text-sm text-red-600'>{formError}</p> : null}
          <button
            className='rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60'
            disabled={isSaving}
            type='submit'>
            Add
          </button>
        </form>
        {serverCount === 0 ? <p className='text-sm text-gray-500'>No MCP servers yet.</p> : null}
        {serverCount > 0 ? (
          <ul className='divide-y rounded-lg border'>
            {servers.map(s => {
              if (!s) return null
              const server = s as unknown as McpServerRow
              return (
                <li className='flex items-center justify-between gap-3 p-3' key={server._id}>
                  <div className='min-w-0 space-y-1'>
                    <p className='truncate text-sm font-medium'>{server.name}</p>
                    <p className='truncate text-xs text-gray-500'>{server.url}</p>
                    <p className='text-xs text-gray-500'>Auth headers: {server.hasAuthHeaders ? 'Configured' : 'Not set'}</p>
                  </div>
                  <button
                    className='rounded-lg border px-3 py-2 text-xs disabled:opacity-60'
                    disabled={deletingId === server._id}
                    onClick={() => onDelete(server._id)}
                    type='button'>
                    Delete
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </section>
    </main>
  )
}

export default SettingsPage
