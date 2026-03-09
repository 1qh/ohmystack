#!/usr/bin/env bun
/* eslint-disable no-console */

/** biome-ignore-all lint/style/noProcessEnv: cli */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const green = (s: string) => `\u001B[32m${s}\u001B[0m`,
  yellow = (s: string) => `\u001B[33m${s}\u001B[0m`,
  dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  SCHEMA_TS = `import { authTables } from '@convex-dev/auth/server'
import { defineSchema } from 'convex/server'
import { ownedTable, rateLimitTable, uploadTables } from '@ohmystack/convex/server'

import { owned } from './t'

export default defineSchema({
  ...authTables,
  ...uploadTables(),
  ...rateLimitTable(),
  blog: ownedTable(owned.blog)
})
`,
  T_TS = `import { cvFile, makeOwned } from '@ohmystack/convex/schema'
import { boolean, object, string, enum as zenum } from 'zod/v4'

const owned = makeOwned({
  blog: object({
    title: string().min(1),
    content: string().min(3),
    category: zenum(['tech', 'life', 'tutorial']),
    published: boolean(),
    coverImage: cvFile().nullable().optional()
  })
})

export { owned }
`,
  LAZY_TS = `import { getAuthUserId } from '@convex-dev/auth/server'
import { makeFileUpload, setup } from '@ohmystack/convex/server'
// import { auditLog, inputSanitize, slowQueryWarn } from '@ohmystack/convex/server'

import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'

const { crud, pq, q, m } = setup({
  action,
  getAuthUserId: getAuthUserId as (ctx: unknown) => Promise<null | string>,
  internalMutation,
  internalQuery,
  // middleware: [auditLog(), slowQueryWarn(), inputSanitize()],
  mutation,
  query
})

const file = makeFileUpload({
  action,
  getAuthUserId: getAuthUserId as (ctx: unknown) => Promise<null | string>,
  internalMutation,
  internalQuery,
  mutation,
  namespace: 'file',
  query
})

export { crud, file, m, pq, q }
`,
  BLOG_TS = `import { crud } from './lazy'
import { owned } from './t'

export const {
  bulkRm, bulkUpdate, create,
  pub: { list, read },
  rm, update
} = crud('blog', owned.blog, { search: 'content' })
`,
  FILE_TS = `import { file } from './lazy'

export const { info, upload } = file
`,
  GUARDED_API_TS = `import { guardApi } from '@ohmystack/convex'

import { api as rawApi } from './convex/_generated/api'

const api = guardApi(rawApi, ['blog', 'file', 'user'])

export { api }
`,
  PROVIDER_TSX = `'use client'
import type { ReactNode } from 'react'

import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ConvexReactClient } from 'convex/react'
import { ConvexErrorBoundary, FileApiProvider } from '@ohmystack/convex/components'

import { api } from '../convex/_generated/api'

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? '')

const FILE_API = { info: api.file.info, upload: api.file.upload }

const ConvexProvider = ({ children }: { children: ReactNode }) => (
  <ConvexErrorBoundary>
    <ConvexAuthProvider client={convex}>
      <FileApiProvider value={FILE_API}>{children}</FileApiProvider>
    </ConvexAuthProvider>
  </ConvexErrorBoundary>
)

export default ConvexProvider
`,
  LAYOUT_TSX = `import type { ReactNode } from 'react'

import ConvexProvider from './convex-provider'

import './globals.css'

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang='en'>
    <body>
      <ConvexProvider>{children}</ConvexProvider>
    </body>
  </html>
)

export default RootLayout
`,
  PAGE_TSX = `'use client'
import { useMutation } from 'convex/react'
import { useList } from '@ohmystack/convex/react'
import { useState } from 'react'

import { api } from '../../convex/_generated/api'

const BlogPage = () => {
  const { items, loadMore, status } = useList(api.blog.list)
  const createBlog = useMutation(api.blog.create)
  const [title, setTitle] = useState('')

  const handleCreate = async () => {
    if (!title.trim()) return
    await createBlog({ title, content: '', category: 'tech', published: false })
    setTitle('')
  }

  return (
    <main className='mx-auto max-w-2xl p-8'>
      <h1 className='mb-6 text-2xl font-bold'>Blog</h1>
      <div className='mb-6 flex gap-2'>
        <input
          className='flex-1 rounded border px-3 py-2'
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder='New post title...'
          value={title}
        />
        <button
          className='rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700'
          onClick={handleCreate}
          type='button'>
          Create
        </button>
      </div>
      <ul className='divide-y'>
        {items.map(b => (
          <li className='py-3' key={b._id}>
            <span className='font-medium'>{b.title}</span>
            <span className='ml-2 text-sm text-zinc-500'>{b.category}</span>
          </li>
        ))}
      </ul>
      {status === 'CanLoadMore' && (
        <button className='mt-4 text-sm text-zinc-500 hover:text-zinc-900' onClick={loadMore} type='button'>
          Load more
        </button>
      )}
      {items.length === 0 && <p className='text-zinc-400'>No posts yet. Create one above.</p>}
    </main>
  )
}

export default BlogPage
`,
  ENV_LOCAL = `CONVEX_URL=
NEXT_PUBLIC_CONVEX_URL=
`,
  BACKEND_FILES: [string, string][] = [
    ['schema.ts', SCHEMA_TS],
    ['t.ts', T_TS],
    ['lazy.ts', LAZY_TS],
    ['file.ts', FILE_TS],
    ['blog.ts', BLOG_TS]
  ],
  FRONTEND_FILES: [string, string][] = [
    ['guarded-api.ts', GUARDED_API_TS],
    ['convex-provider.tsx', PROVIDER_TSX],
    ['layout.tsx', LAYOUT_TSX],
    ['page.tsx', PAGE_TSX]
  ],
  writeOneFile = ({
    absDir,
    content,
    label,
    name
  }: {
    absDir: string
    content: string
    label: string
    name: string
  }): boolean => {
    const path = join(absDir, name)
    if (existsSync(path)) {
      console.log(`  ${yellow('skip')} ${label}/${name} ${dim('(exists)')}`)
      return false
    }
    writeFileSync(path, content)
    console.log(`  ${green('✓')} ${label}/${name}`)
    return true
  },
  writeFilesToDir = (absDir: string, label: string, files: [string, string][]) => {
    if (!existsSync(absDir)) mkdirSync(absDir, { recursive: true })
    let created = 0,
      skipped = 0
    for (const [name, content] of files)
      if (writeOneFile({ absDir, content, label, name })) created += 1
      else skipped += 1
    return { created, skipped }
  },
  parseFlags = (args: string[]) => {
    let convexDir = 'convex',
      appDir = 'src/app',
      help = false
    for (const arg of args)
      if (arg === '--help' || arg === '-h') help = true
      else if (arg.startsWith('--convex-dir=')) convexDir = arg.slice('--convex-dir='.length)
      else if (arg.startsWith('--app-dir=')) appDir = arg.slice('--app-dir='.length)

    return { appDir, convexDir, help }
  },
  printHelp = () => {
     console.log(`${bold('ohmystack-convex init')} — scaffold an @ohmystack/convex project\n`)
     console.log(bold('Usage:'))
     console.log('  ohmystack-convex init [options]\n')
    console.log(bold('Options:'))
    console.log(`  --convex-dir=DIR  Convex directory ${dim('(default: convex)')}`)
    console.log(`  --app-dir=DIR     Next.js app directory ${dim('(default: src/app)')}`)
    console.log('  --help, -h        Show this help\n')
  },
  printSummary = (created: number, skipped: number) => {
    console.log('')
    if (created > 0) console.log(`${green('✓')} Created ${created} file${created > 1 ? 's' : ''}.`)
    if (skipped > 0) console.log(`${yellow('⚠')} Skipped ${skipped} existing file${skipped > 1 ? 's' : ''}.`)
     console.log(`\n${bold('Next steps:')}`)
     console.log(`  ${dim('$')} bun add @ohmystack/convex convex @convex-dev/auth zod`)
     console.log(`  ${dim('$')} bunx convex dev & bun dev\n`)
  },
  init = (args: string[] = []) => {
    const { appDir, convexDir, help } = parseFlags(args)
    if (help) {
      printHelp()
      return
    }
     console.log(`\n${bold('Scaffolding @ohmystack/convex project...')}\n`)
    const b = writeFilesToDir(join(process.cwd(), convexDir), convexDir, BACKEND_FILES),
      f = writeFilesToDir(join(process.cwd(), appDir), appDir, FRONTEND_FILES),
      envPath = join(process.cwd(), '.env.local')
    if (existsSync(envPath)) console.log(`  ${yellow('skip')} .env.local ${dim('(exists)')}`)
    else {
      writeFileSync(envPath, ENV_LOCAL)
      console.log(`  ${green('✓')} .env.local`)
    }
    printSummary(b.created + f.created, b.skipped + f.skipped)
  }

if (process.argv[1]?.endsWith('create.ts') || process.argv[1]?.endsWith('create-ohmystack-convex-app'))
  init(process.argv.slice(2))

export { init }
