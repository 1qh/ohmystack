#!/usr/bin/env bun
/* eslint-disable no-console, no-continue, @typescript-eslint/require-await */
/** biome-ignore-all lint/nursery/noContinue: flow clarity */
/** biome-ignore-all lint/suspicious/useAwait: TUI expects Promise<void> */
import { env } from 'bun'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve as resolvePath } from 'node:path'
import type { Db } from './scaffold-ops'
import { bold, dim } from './ansi'
import { die } from './cli-utils'
import { patchRootPackageJson, removeDirs, rmSafe } from './scaffold-ops'
interface Manifest {
  db: Db
  includeDemos: boolean
  scaffoldedAt: string
  scaffoldedFrom: string
  version: number
}
interface SyncOpts {
  dryRun: boolean
  force: boolean
}
const DEFAULT_REPO = '1qh/noboil'
const REPO_SPEC = env.NOBOIL_REPO ?? DEFAULT_REPO
const REPO_GIT_URL =
  REPO_SPEC.includes('://') || REPO_SPEC.startsWith('/') ? REPO_SPEC : `https://github.com/${REPO_SPEC}.git`
const ROOT_CONFIG_FILES = new Set([
  'biome.jsonc',
  'convex.yml',
  'lintmax.config.ts',
  'package.json',
  'spacetimedb.yml',
  'tsconfig.json',
  'turbo.json'
])
const printHelp = () => {
  console.log(`\n${bold('noboil sync')} — pull upstream changes\n`)
  console.log(bold('Usage:'))
  console.log('  noboil sync [options]\n')
  console.log(bold('Options:'))
  console.log(`  --dry-run                  ${dim('Show what would change without writing files')}`)
  console.log(`  --force                    ${dim('Update files even when locally modified')}`)
  console.log(`  --help, -h                 ${dim('Show this help')}\n`)
}
const parseArgs = (args: string[]) => {
  const opts: SyncOpts = { dryRun: false, force: false }
  for (const arg of args)
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--force') opts.force = true
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else die(`Unknown option ${arg}`)
  return opts
}
const readManifest = (cwd: string) => {
  const manifestPath = join(cwd, '.noboilrc.json')
  if (!existsSync(manifestPath)) die('Not a noboil project. Run `noboil init` first.')
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as Partial<Manifest>
  if (
    typeof parsed.version !== 'number' ||
    (parsed.db !== 'convex' && parsed.db !== 'spacetimedb') ||
    typeof parsed.includeDemos !== 'boolean' ||
    typeof parsed.scaffoldedFrom !== 'string' ||
    typeof parsed.scaffoldedAt !== 'string'
  )
    die('Invalid .noboilrc.json manifest')
  return parsed as Manifest
}
const runGit = ({ args, cwd, err }: { args: string[]; cwd: string; err: string }) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    const stderr = result.stderr.trim()
    die(stderr ? `${err}\n${dim(stderr)}` : err)
  }
  return result.stdout.trim()
}
const prepareUpstream = ({ db, includeDemos, root }: { db: Db; includeDemos: boolean; root: string }) => {
  removeDirs({ db, dir: root, includeDemos })
  patchRootPackageJson({ db, dir: root, includeDemos })
}
const hashFile = (filePath: string) => createHash('sha256').update(readFileSync(filePath)).digest('hex')
const listFiles = ({ rel = '', root }: { rel?: string; root: string }) => {
  const full = rel ? join(root, rel) : root
  const entries = readdirSync(full, { withFileTypes: true })
  const out: string[] = []
  for (const entry of entries)
    if (entry.name !== '.git' && entry.name !== 'node_modules') {
      const nextRel = rel ? join(rel, entry.name) : entry.name
      if (entry.isDirectory()) {
        const child = listFiles({ rel: nextRel, root })
        for (const file of child) out.push(file)
      } else out.push(nextRel)
    }
  return out
}
const isRootConfig = (relPath: string) => !relPath.includes('/') && ROOT_CONFIG_FILES.has(relPath)
const writeLocalFile = ({ content, path }: { content: Uint8Array; path: string }) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}
const processOneFile = ({
  additions,
  cwd,
  dryRun,
  force,
  relPath,
  rootReview,
  skipped,
  tmpDir,
  updates
}: {
  additions: string[]
  cwd: string
  dryRun: boolean
  force: boolean
  relPath: string
  rootReview: string[]
  skipped: string[]
  tmpDir: string
  updates: string[]
}) => {
  const upstreamPath = join(tmpDir, relPath)
  const localPath = join(cwd, relPath)
  const upstreamContent = readFileSync(upstreamPath)
  if (!existsSync(localPath)) {
    additions.push(relPath)
    if (!dryRun) writeLocalFile({ content: upstreamContent, path: localPath })
    return
  }
  if (hashFile(localPath) === hashFile(upstreamPath)) return
  if (force || relPath.startsWith('lib/') || relPath.startsWith('backend/') || relPath.startsWith('tool/')) {
    updates.push(relPath)
    if (!dryRun) writeLocalFile({ content: upstreamContent, path: localPath })
  } else if (relPath.startsWith('web/')) skipped.push(`${relPath} ${dim('(skipped (modified locally))')}`)
  else if (isRootConfig(relPath)) rootReview.push(`${relPath} ${dim('(review manually)')}`)
  else skipped.push(`${relPath} ${dim('(skipped (modified locally))')}`)
}
const CACHE_REPO_DIR = () => join(homedir(), '.noboil', 'upstream.git')
const refreshCache = (cwd: string) => {
  const cacheDir = CACHE_REPO_DIR()
  if (existsSync(cacheDir)) {
    runGit({ args: ['fetch', '--depth', '1', 'origin', 'HEAD'], cwd: cacheDir, err: 'git fetch failed during sync' })
    runGit({ args: ['reset', '--hard', 'FETCH_HEAD'], cwd: cacheDir, err: 'git reset failed during sync' })
    return
  }
  mkdirSync(dirname(cacheDir), { recursive: true })
  runGit({
    args: ['clone', '--depth', '1', REPO_GIT_URL, cacheDir],
    cwd,
    err: 'git clone failed during sync'
  })
}
const runSync = async (opts: SyncOpts, onProgress: (p: Record<string, unknown>) => void): Promise<void> => {
  const cwd = process.cwd()
  const manifest = readManifest(cwd)
  const tmpDir = join(tmpdir(), `noboil-sync-${Date.now()}`)
  onProgress({ phase: 'cloning' })
  try {
    refreshCache(cwd)
    cpSync(CACHE_REPO_DIR(), tmpDir, { recursive: true })
    const nextHash = runGit({
      args: ['rev-parse', 'HEAD'],
      cwd: tmpDir,
      err: 'failed to read upstream commit hash'
    })
    onProgress({ fromHash: manifest.scaffoldedFrom, toHash: nextHash })
    if (nextHash === manifest.scaffoldedFrom) {
      onProgress({ phase: 'done' })
      return
    }
    onProgress({ phase: 'comparing' })
    prepareUpstream({ db: manifest.db, includeDemos: manifest.includeDemos, root: tmpDir })
    const upstreamFiles = listFiles({ root: tmpDir })
    onProgress({ phase: 'processing', total: upstreamFiles.length })
    const skipped: string[] = []
    const updates: string[] = []
    const additions: string[] = []
    const rootReview: string[] = []
    const actions: { kind: 'added' | 'review' | 'skipped' | 'updated'; relPath: string }[] = []
    for (const relPath of upstreamFiles) {
      if (relPath === '.noboilrc.json') continue
      const before = {
        additions: additions.length,
        rootReview: rootReview.length,
        skipped: skipped.length,
        updates: updates.length
      }
      processOneFile({
        additions,
        cwd,
        dryRun: opts.dryRun,
        force: opts.force,
        relPath,
        rootReview,
        skipped,
        tmpDir,
        updates
      })
      if (updates.length > before.updates) actions.push({ kind: 'updated', relPath })
      else if (additions.length > before.additions) actions.push({ kind: 'added', relPath })
      else if (rootReview.length > before.rootReview) actions.push({ kind: 'review', relPath })
      else if (skipped.length > before.skipped) actions.push({ kind: 'skipped', relPath })
      onProgress({ actions: [...actions], current: relPath })
    }
    if (!opts.dryRun) {
      const nextManifest: Manifest = {
        db: manifest.db,
        includeDemos: manifest.includeDemos,
        scaffoldedAt: new Date().toISOString(),
        scaffoldedFrom: nextHash,
        version: manifest.version
      }
      writeFileSync(join(cwd, '.noboilrc.json'), `${JSON.stringify(nextManifest, null, 2)}\n`)
    }
    onProgress({ phase: 'done' })
  } finally {
    rmSafe(resolvePath(tmpDir))
  }
}
const sync = async (args: string[]) => {
  const opts = parseArgs(args)
  const { runSyncTui } = await import('./sync-tui')
  const code = await runSyncTui({ dryRun: opts.dryRun, force: opts.force, run: runSync })
  if (code !== 0) process.exit(code)
}
export { sync }
