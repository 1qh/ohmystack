#!/usr/bin/env bun
/* eslint-disable no-console */
import { env } from 'bun'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve as resolvePath } from 'node:path'
type Db = 'convex' | 'spacetimedb'
interface Manifest {
  db: Db
  includeDemos: boolean
  includeNative: boolean
  scaffoldedAt: string
  scaffoldedFrom: string
  version: number
}
interface SyncOpts {
  dryRun: boolean
  force: boolean
}
const bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  green = (s: string) => `\u001B[32m${s}\u001B[0m`,
  yellow = (s: string) => `\u001B[33m${s}\u001B[0m`,
  red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  DEFAULT_REPO = '1qh/noboil',
  REPO_SPEC = env.NOBOIL_REPO ?? DEFAULT_REPO,
  REPO_GIT_URL =
    REPO_SPEC.includes('://') || REPO_SPEC.startsWith('/') ? REPO_SPEC : `https://github.com/${REPO_SPEC}.git`,
  REPO = REPO_SPEC,
  REMOVE_ALWAYS = ['PLAN.md', 'AGENTS.md', 'doc', 'lib/shared', '.github'],
  ROOT_CONFIG_FILES = new Set([
    'biome.jsonc',
    'lintmax.config.ts',
    'noboil.yml',
    'package.json',
    'tsconfig.json',
    'turbo.json'
  ]),
  printHelp = () => {
    console.log(`\n${bold('noboil sync')} — pull upstream changes\n`)
    console.log(bold('Usage:'))
    console.log('  noboil sync [options]\n')
    console.log(bold('Options:'))
    console.log(`  --dry-run                  ${dim('Show what would change without writing files')}`)
    console.log(`  --force                    ${dim('Update files even when locally modified')}`)
    console.log(`  --help, -h                 ${dim('Show this help')}\n`)
  },
  parseArgs = (args: string[]) => {
    const opts: SyncOpts = { dryRun: false, force: false }
    for (const arg of args)
      if (arg === '--dry-run') opts.dryRun = true
      else if (arg === '--force') opts.force = true
      else if (arg === '--help' || arg === '-h') {
        printHelp()
        process.exit(0)
      } else {
        console.error(`\n${red('Error:')} Unknown option ${arg}\n`)
        process.exit(1)
      }
    return opts
  },
  readManifest = (cwd: string) => {
    const manifestPath = join(cwd, '.noboilrc.json')
    if (!existsSync(manifestPath)) {
      console.error(`${red('Error:')} Not a noboil project. Run \`noboil init\` first.`)
      process.exit(1)
    }
    const raw = readFileSync(manifestPath, 'utf8'),
      parsed = JSON.parse(raw) as Partial<Manifest>
    if (
      typeof parsed.version !== 'number' ||
      (parsed.db !== 'convex' && parsed.db !== 'spacetimedb') ||
      typeof parsed.includeDemos !== 'boolean' ||
      typeof parsed.includeNative !== 'boolean' ||
      typeof parsed.scaffoldedFrom !== 'string' ||
      typeof parsed.scaffoldedAt !== 'string'
    ) {
      console.error(`${red('Error:')} Invalid .noboilrc.json manifest`)
      process.exit(1)
    }
    return parsed as Manifest
  },
  runGit = ({ args, cwd, err }: { args: string[]; cwd: string; err: string }) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
    if (result.status !== 0) {
      const stderr = result.stderr.trim()
      console.error(`${red('Error:')} ${err}`)
      if (stderr) console.error(dim(stderr))
      process.exit(1)
    }
    return result.stdout.trim()
  },
  rmSafe = (path: string) => {
    if (existsSync(path)) rmSync(path, { force: true, recursive: true })
  },
  patchRootPackageJson = ({ db, dir, includeDemos }: { db: Db; dir: string; includeDemos: boolean }) => {
    const pkgPath = join(dir, 'package.json'),
      raw = readFileSync(pkgPath, 'utf8'),
      pkg = JSON.parse(raw) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
        name?: string
        private?: boolean
        scripts?: Record<string, string>
        workspaces?: string[]
      },
      otherDb = db === 'convex' ? 'spacetimedb' : 'convex',
      shouldRemove = (key: string, val: string) =>
        key === 'test' ||
        (db === 'spacetimedb' &&
          (key.includes('swift') || key.includes('desktop') || key.includes('mobile') || key.includes('codegen'))) ||
        (db === 'convex' && key.startsWith('spacetime:')) ||
        (!includeDemos && (key.startsWith('dev:') || key.startsWith('test:e2e'))) ||
        key.includes('mobile') ||
        key.includes('desktop') ||
        key.includes('swift') ||
        val.includes(otherDb)
    pkg.name = 'my-app'
    pkg.private = true
    const workspaces: string[] = ['lib/*', 'backend/*']
    if (includeDemos)
      if (db === 'convex') workspaces.push('web/cvx/*')
      else workspaces.push('web/stdb/*')
    pkg.workspaces = workspaces
    if (pkg.scripts) {
      const keep: Record<string, string> = {
        test: db === 'convex' ? 'bun --cwd lib/convex test' : 'bun --cwd lib/spacetimedb test'
      }
      for (const [key, val] of Object.entries(pkg.scripts)) if (!shouldRemove(key, val)) keep[key] = val
      pkg.scripts = keep
    }
    const selectedLib = db === 'convex' ? '@noboil/convex' : '@noboil/spacetimedb',
      nextDependencies: Record<string, string> = {}
    if (pkg.dependencies)
      for (const [key, val] of Object.entries(pkg.dependencies)) if (!key.startsWith('@a/')) nextDependencies[key] = val
    nextDependencies[selectedLib] = 'workspace:*'
    pkg.dependencies = nextDependencies
    if (pkg.devDependencies) {
      const nextDevDependencies: Record<string, string> = {}
      for (const [key, val] of Object.entries(pkg.devDependencies))
        if (!key.startsWith('@a/')) nextDevDependencies[key] = val
      pkg.devDependencies = nextDevDependencies
    }
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  },
  removeDirs = ({ db, dir, includeDemos }: { db: Db; dir: string; includeDemos: boolean }) => {
    const dbTag = db === 'convex' ? 'cvx' : 'stdb',
      otherTag = db === 'convex' ? 'stdb' : 'cvx',
      toRemove = [
        ...REMOVE_ALWAYS,
        `web/${otherTag}`,
        'expo',
        'mobile',
        'desktop',
        'swiftcore',
        'backend/agent',
        'tool/cli'
      ]
    if (!includeDemos) toRemove.push(`web/${dbTag}`)
    for (const path of toRemove) rmSafe(join(dir, path))
  },
  prepareUpstream = ({ db, includeDemos, root }: { db: Db; includeDemos: boolean; root: string }) => {
    removeDirs({ db, dir: root, includeDemos })
    patchRootPackageJson({ db, dir: root, includeDemos })
  },
  hashFile = (filePath: string) => createHash('sha256').update(readFileSync(filePath)).digest('hex'),
  listFiles = ({ rel = '', root }: { rel?: string; root: string }) => {
    const full = rel ? join(root, rel) : root,
      entries = readdirSync(full, { withFileTypes: true }),
      out: string[] = []
    for (const entry of entries)
      if (entry.name !== '.git' && entry.name !== 'node_modules') {
        const nextRel = rel ? join(rel, entry.name) : entry.name
        if (entry.isDirectory()) {
          const child = listFiles({ rel: nextRel, root })
          for (const file of child) out.push(file)
        } else out.push(nextRel)
      }
    return out
  },
  isRootConfig = (relPath: string) => !relPath.includes('/') && ROOT_CONFIG_FILES.has(relPath),
  writeLocalFile = ({ content, path }: { content: Uint8Array; path: string }) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  },
  processOneFile = ({
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
    const upstreamPath = join(tmpDir, relPath),
      localPath = join(cwd, relPath),
      upstreamContent = readFileSync(upstreamPath)
    if (!existsSync(localPath)) {
      additions.push(relPath)
      if (!dryRun) writeLocalFile({ content: upstreamContent, path: localPath })
      return
    }
    if (hashFile(localPath) === hashFile(upstreamPath)) return
    if (force || relPath.startsWith('lib/') || relPath.startsWith('backend/') || relPath.startsWith('tool/')) {
      updates.push(relPath)
      if (!dryRun) writeLocalFile({ content: upstreamContent, path: localPath })
    } else if (relPath.startsWith('web/') || relPath.startsWith('expo/'))
      skipped.push(`${relPath} ${dim('(skipped (modified locally))')}`)
    else if (isRootConfig(relPath)) rootReview.push(`${relPath} ${dim('(review manually)')}`)
    else skipped.push(`${relPath} ${dim('(skipped (modified locally))')}`)
  },
  sync = (args: string[]) => {
    const opts = parseArgs(args),
      cwd = process.cwd(),
      manifest = readManifest(cwd),
      tmpDir = join('/tmp', `noboil-sync-${Date.now()}`)
    console.log(`\n${bold('noboil sync')} — pull upstream changes\n`)
    console.log(`  ${dim('cloning')} ${REPO}...`)
    try {
      runGit({
        args: ['clone', '--depth', '1', REPO_GIT_URL, tmpDir],
        cwd,
        err: 'git clone failed during sync'
      })
      const nextHash = runGit({ args: ['rev-parse', 'HEAD'], cwd: tmpDir, err: 'failed to read upstream commit hash' })
      if (nextHash === manifest.scaffoldedFrom) {
        console.log(`\n${green('Already up to date.')}\n`)
        return
      }
      prepareUpstream({
        db: manifest.db,
        includeDemos: manifest.includeDemos,
        root: tmpDir
      })
      const upstreamFiles = listFiles({ root: tmpDir }),
        skipped: string[] = [],
        updates: string[] = [],
        additions: string[] = [],
        rootReview: string[] = []
      for (const relPath of upstreamFiles)
        if (relPath !== '.noboilrc.json')
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
      if (!opts.dryRun) {
        const nextManifest: Manifest = {
          db: manifest.db,
          includeDemos: manifest.includeDemos,
          includeNative: manifest.includeNative,
          scaffoldedAt: new Date().toISOString(),
          scaffoldedFrom: nextHash,
          version: manifest.version
        }
        writeFileSync(join(cwd, '.noboilrc.json'), `${JSON.stringify(nextManifest, null, 2)}\n`)
      }
      const mode = opts.dryRun ? `${yellow('dry-run')} ` : ''
      console.log(
        `\n${bold('Summary')} ${dim(mode)}${dim(`(${manifest.scaffoldedFrom.slice(0, 7)} -> ${nextHash.slice(0, 7)})`)}`
      )
      console.log(`  ${green('+')} files updated: ${updates.length}`)
      console.log(`  ${green('+')} new files added: ${additions.length}`)
      console.log(`  ${yellow('!')} files skipped: ${skipped.length + rootReview.length}`)
      if (rootReview.length > 0) console.log(`  ${yellow('!')} review manually: ${rootReview.length}`)
      for (const file of updates) console.log(`  ${dim('updated')} ${file}`)
      for (const file of additions) console.log(`  ${dim('added')} ${file}`)
      for (const file of skipped) console.log(`  ${yellow('!')} ${file}`)
      for (const file of rootReview) console.log(`  ${yellow('!')} ${file}`)
      if (opts.dryRun) console.log(`\n${dim('No files were written.')}\n`)
      else console.log(`\n${green('Sync complete.')}\n`)
    } finally {
      rmSafe(resolvePath(tmpDir))
    }
  }
export { sync }
