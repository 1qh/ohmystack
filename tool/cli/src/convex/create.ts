#!/usr/bin/env bun
/* eslint-disable no-console */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCliTheme, hasFlag, readEqFlag, writeFilesToDir } from '../shared/cli'
const { bold, dim, green, yellow } = createCliTheme()
const SCHEMA_TS = `import { authTables } from '@convex-dev/auth/server'
import { defineSchema } from 'convex/server'
import { ownedTable, rateLimitTable, uploadTables } from './server'
import { owned } from './s'
export default defineSchema({
  ...authTables,
  ...uploadTables(),
  ...rateLimitTable(),
  blog: ownedTable(owned.blog)
})
`
const T_TS = `import { file, makeOwned } from './schema'
import { boolean, object, string, enum as zenum } from 'zod/v4'
const owned = makeOwned({
  blog: object({
    title: string().min(1),
    content: string().min(3),
    category: zenum(['tech', 'life', 'tutorial']),
    published: boolean(),
    coverImage: file().nullable().optional()
  })
})
export { owned }
`
const LAZY_TS = `import { getAuthUserId } from '@convex-dev/auth/server'
import { makeFileUpload, setup } from './server'
// import { auditLog, inputSanitize, slowQueryWarn } from './server'
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
`
const BLOG_TS = `import { crud } from './lazy'
import { owned } from './s'
export const {
  create,
  pub: { list, read },
  rm, update
} = crud('blog', owned.blog, { search: 'content' })
`
const FILE_TS = `import { file } from './lazy'
export const { info, upload } = file
`
const GUARDED_API_TS = `import { guardApi } from './'
import { api as rawApi } from './convex/_generated/api'
const api = guardApi(rawApi, ['blog', 'file', 'user'])
export { api }
`
const PROVIDER_TSX = `'use client'
import type { ReactNode } from 'react'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ConvexReactClient } from 'convex/react'
import { ErrorBoundary, FileApiProvider } from './components'
import { api } from '../convex/_generated/api'
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? '')
const FILE_API = { info: api.file.info, upload: api.file.upload }
const ConvexProvider = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary>
    <ConvexAuthProvider client={convex}>
      <FileApiProvider value={FILE_API}>{children}</FileApiProvider>
    </ConvexAuthProvider>
  </ErrorBoundary>
)
export default ConvexProvider
`
const LAYOUT_TSX = `import type { ReactNode } from 'react'
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
`
const PAGE_TSX = `'use client'
import { useMutation } from 'convex/react'
import { useList } from './react'
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
          className='rounded bg-background px-4 py-2 text-foreground hover:bg-muted'
          onClick={handleCreate}
          type='button'>
          Create
        </button>
      </div>
      <ul className='divide-y'>
        {items.map(b => (
          <li className='py-3' key={b._id}>
            <span className='font-medium'>{b.title}</span>
            <span className='ml-2 text-sm text-muted-foreground'>{b.category}</span>
          </li>
        ))}
      </ul>
      {status === 'CanLoadMore' && (
        <button className='mt-4 text-sm text-muted-foreground hover:text-foreground' onClick={loadMore} type='button'>
          Load more
        </button>
      )}
      {items.length === 0 && <p className='text-muted-foreground'>No posts yet. Create one above.</p>}
    </main>
  )
}
export default BlogPage
`
const ENV_LOCAL = `CONVEX_URL=
NEXT_PUBLIC_CONVEX_URL=
`
const BACKEND_FILES: [string, string][] = [
  ['schema.ts', SCHEMA_TS],
  ['t.ts', T_TS],
  ['lazy.ts', LAZY_TS],
  ['file.ts', FILE_TS],
  ['blog.ts', BLOG_TS]
]
const FRONTEND_FILES: [string, string][] = [
  ['guarded-api.ts', GUARDED_API_TS],
  ['convex-provider.tsx', PROVIDER_TSX],
  ['layout.tsx', LAYOUT_TSX],
  ['page.tsx', PAGE_TSX]
]
const parseFlags = (args: string[]) => {
  let convexDir = 'convex'
  let appDir = 'src/app'
  const help = hasFlag(args, '--help', '-h')
  convexDir = readEqFlag(args, 'convex-dir', convexDir)
  appDir = readEqFlag(args, 'app-dir', appDir)
  return { appDir, convexDir, help }
}
const printHelp = () => {
  console.log(`${bold('noboil-convex init')} — scaffold an noboil/convex project\n`)
  console.log(bold('Usage:'))
  console.log('  noboil-convex init [options]\n')
  console.log(bold('Options:'))
  console.log(`  --convex-dir=DIR  Convex directory ${dim('(default: convex)')}`)
  console.log(`  --app-dir=DIR     Next.js app directory ${dim('(default: src/app)')}`)
  console.log('  --help, -h        Show this help\n')
}
const printSummary = (created: number, skipped: number) => {
  console.log('')
  if (created > 0) console.log(`${green('✓')} Created ${created} file${created > 1 ? 's' : ''}.`)
  if (skipped > 0) console.log(`${yellow('⚠')} Skipped ${skipped} existing file${skipped > 1 ? 's' : ''}.`)
  console.log(`\n${bold('Next steps:')}`)
  console.log(`  ${dim('$')} bun add noboil/convex convex @convex-dev/auth zod`)
  console.log(`  ${dim('$')} bunx convex dev & bun dev\n`)
}
const init = (args: string[] = []) => {
  const { appDir, convexDir, help } = parseFlags(args)
  if (help) {
    printHelp()
    return
  }
  console.log(`\n${bold('Scaffolding noboil/convex project...')}\n`)
  const b = writeFilesToDir({
    baseDir: join(process.cwd(), convexDir),
    files: BACKEND_FILES,
    label: convexDir,
    theme: { dim, green, yellow }
  })
  const f = writeFilesToDir({
    baseDir: join(process.cwd(), appDir),
    files: FRONTEND_FILES,
    label: appDir,
    theme: { dim, green, yellow }
  })
  const envPath = join(process.cwd(), '.env.local')
  if (existsSync(envPath)) console.log(`  ${yellow('skip')} .env.local ${dim('(exists)')}`)
  else {
    writeFileSync(envPath, ENV_LOCAL)
    console.log(`  ${green('✓')} .env.local`)
  }
  printSummary(b.created + f.created, b.skipped + f.skipped)
}
if (process.argv[1]?.endsWith('create.ts') || process.argv[1]?.endsWith('create-noboil-convex-app'))
  init(process.argv.slice(2))
export { init }
