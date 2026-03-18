#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/style/noProcessEnv: cli */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const green = (s: string) => `\u001B[32m${s}\u001B[0m`,
  yellow = (s: string) => `\u001B[33m${s}\u001B[0m`,
  dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  TABLES_TS = `import { t } from 'spacetimedb'

const blogTable = {
  id: t.u32(),
  title: t.string(),
  content: t.string(),
  category: t.string(),
  published: t.bool()
}

export { blogTable }
`,
  SCHEMA_TS = `import { schema, table } from 'spacetimedb'

import { blogTable } from './tables'

const db = schema({
  blog: table({ public: true }, blogTable)
})

export { db }
`,
  DB_TS = `import { makeCrud } from '@noboil/spacetimedb/server'

import { db } from './schema'

const blog = makeCrud({
  schema: db,
  table: 'blog'
})

export { blog }
`,
  BLOG_TS = `import { reducer } from 'spacetimedb'

import { blog } from '../db'

const createBlog = reducer('blog.create', (ctx, input: { category: string; content: string; published: boolean; title: string }) =>
  blog.create(ctx, input)
)

const updateBlog = reducer(
  'blog.update',
  (ctx, input: { content?: string; id: number; published?: boolean; title?: string }) => blog.update(ctx, input.id, input)
)

const removeBlog = reducer('blog.rm', (ctx, input: { id: number }) => blog.rm(ctx, input.id))

export { createBlog, removeBlog, updateBlog }
`,
  CLIENT_TS = `'use client'

import { createContext, useContext } from 'react'

interface SpacetimeClient {
  callReducer: (name: string, input: Record<string, unknown>) => Promise<void>
}

const clientContext = createContext<null | SpacetimeClient>(null)

const useSpacetime = (): SpacetimeClient => {
  const client = useContext(clientContext)
  if (!client) throw new Error('Spacetime client not configured')
  return client
}

export { clientContext, useSpacetime }
`,
  LAYOUT_TSX = `import type { ReactNode } from 'react'

import './globals.css'

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang='en'>
    <body>{children}</body>
  </html>
)

export default RootLayout
`,
  PAGE_TSX = `'use client'

import { useState } from 'react'

import { useSpacetime } from '../spacetime-client'

const BlogPage = () => {
  const spacetime = useSpacetime()
  const [title, setTitle] = useState('')

  const handleCreate = async () => {
    if (!title.trim()) return
    await spacetime.callReducer('blog.create', {
      category: 'tech',
      content: '',
      published: false,
      title
    })
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
        <button className='rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700' onClick={handleCreate} type='button'>
          Create
        </button>
      </div>
    </main>
  )
}

export default BlogPage
`,
  ENV_LOCAL = `SPACETIME_SERVER_URL=http://localhost:3000
NEXT_PUBLIC_SPACETIME_SERVER_URL=http://localhost:3000
`,
  TSCONFIG = JSON.stringify(
    {
      compilerOptions: {
        allowJs: true,
        esModuleInterop: true,
        incremental: true,
        isolatedModules: true,
        jsx: 'preserve',
        lib: ['dom', 'dom.iterable', 'esnext'],
        module: 'esnext',
        moduleResolution: 'bundler',
        noEmit: true,
        resolveJsonModule: true,
        skipLibCheck: true,
        strict: true,
        target: 'es2017'
      },
      exclude: ['node_modules'],
      include: ['**/*.ts', '**/*.tsx']
    },
    null,
    2
  ),
  DEP_LIST = ['@noboil/spacetimedb', 'spacetimedb', 'zod'],
  installDeps = (cwd: string) => {
    const missing: string[] = []
    for (const dep of DEP_LIST) if (!existsSync(join(cwd, 'node_modules', dep))) missing.push(dep)
    if (missing.length === 0) {
      console.log(`  ${dim('deps already installed')}`)
      return
    }
    console.log(`  installing ${missing.join(', ')}...`)
    try {
      execSync(`bun add ${missing.join(' ')}`, { cwd, stdio: 'pipe' })
      console.log(`  ${green('✓')} installed ${missing.length} package${missing.length > 1 ? 's' : ''}`)
    } catch {
      console.log(`  ${yellow('⚠')} install failed — run ${dim(`bun add ${missing.join(' ')}`)} manually`)
    }
  },
  BACKEND_FILES: [string, string][] = [
    ['tables.ts', TABLES_TS],
    ['schema.ts', SCHEMA_TS],
    ['db.ts', DB_TS],
    ['reducers/blog.ts', BLOG_TS]
  ],
  FRONTEND_FILES: [string, string][] = [
    ['spacetime-client.ts', CLIENT_TS],
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
    const parent = path.slice(0, path.lastIndexOf('/'))
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true })
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
    let moduleDir = 'module',
      appDir = 'src/app',
      help = false
    for (const arg of args)
      if (arg === '--help' || arg === '-h') help = true
      else if (arg.startsWith('--module-dir=')) moduleDir = arg.slice('--module-dir='.length)
      else if (arg.startsWith('--app-dir=')) appDir = arg.slice('--app-dir='.length)

    return { appDir, help, moduleDir }
  },
  printHelp = () => {
    console.log(`${bold('noboil-stdb init')} — scaffold a @noboil/spacetimedb SpacetimeDB project\n`)
    console.log(bold('Usage:'))
    console.log('  noboil-stdb init [options]\n')
    console.log(bold('Options:'))
    console.log(`  --module-dir=DIR  SpacetimeDB module directory ${dim('(default: module)')}`)
    console.log(`  --app-dir=DIR     Next.js app directory ${dim('(default: src/app)')}`)
    console.log('  --help, -h        Show this help\n')
  },
  printSummary = (created: number, skipped: number) => {
    console.log('')
    if (created > 0) console.log(`${green('✓')} Created ${created} file${created > 1 ? 's' : ''}.`)
    if (skipped > 0) console.log(`${yellow('⚠')} Skipped ${skipped} existing file${skipped > 1 ? 's' : ''}.`)
    console.log(`\n${bold('Next steps:')}`)
    console.log(`  ${dim('$')} spacetime publish && spacetime generate && bun dev\n`)
  },
  writeConfigFile = (path: string, name: string, content: string) => {
    if (existsSync(path)) console.log(`  ${yellow('skip')} ${name} ${dim('(exists)')}`)
    else {
      writeFileSync(path, content)
      console.log(`  ${green('✓')} ${name}`)
    }
  },
  scaffold = (cwd: string, moduleDir: string, appDir: string) => {
    const b = writeFilesToDir(join(cwd, moduleDir), moduleDir, BACKEND_FILES),
      f = writeFilesToDir(join(cwd, appDir), appDir, FRONTEND_FILES)
    writeConfigFile(join(cwd, '.env.local'), '.env.local', ENV_LOCAL)
    writeConfigFile(join(cwd, 'tsconfig.json'), 'tsconfig.json', TSCONFIG)
    if (existsSync(join(cwd, 'package.json'))) installDeps(cwd)
    else
      console.log(
        `  ${yellow('⚠')} no package.json — run ${dim('bun init && bun add @noboil/spacetimedb spacetimedb zod')} first`
      )
    return { created: b.created + f.created, skipped: b.skipped + f.skipped }
  },
  cmdExists = (cmd: string): boolean => {
    try {
      execSync(`command -v ${cmd}`, { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  },
  preflight = () => {
    console.log(bold('Pre-flight checks:'))
    const warnings: string[] = []
    if (cmdExists('spacetime')) console.log(`  ${green('✓')} spacetime CLI`)
    else warnings.push(`spacetime CLI not found — ${dim('curl -sSf https://install.spacetimedb.com | sh')}`)
    if (cmdExists('docker'))
      try {
        execSync('docker info', { stdio: 'pipe' })
        console.log(`  ${green('✓')} Docker running`)
      } catch {
        warnings.push(`Docker installed but not running — ${dim('start Docker Desktop or systemctl start docker')}`)
      }
    else warnings.push(`Docker not found — ${dim('https://docs.docker.com/get-docker/')}`)
    for (const w of warnings) console.log(`  ${yellow('⚠')} ${w}`)
    console.log('')
  },
  init = (args: string[] = []) => {
    const { appDir, help, moduleDir } = parseFlags(args)
    if (help) {
      printHelp()
      return
    }
    console.log(`\n${bold('Scaffolding @noboil/spacetimedb project...')}\n`)
    preflight()
    const { created, skipped } = scaffold(process.cwd(), moduleDir, appDir)
    printSummary(created, skipped)
  }

if (process.argv[1]?.endsWith('create.ts') || process.argv[1]?.endsWith('create-noboil-stdb-app'))
  init(process.argv.slice(2))

export { init }
