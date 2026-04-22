#!/usr/bin/env bun
/* eslint-disable no-console, @typescript-eslint/no-dynamic-delete, @typescript-eslint/no-unnecessary-condition */
import { env } from 'bun'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'
import { createInterface } from 'node:readline'
/** biome-ignore-all lint/style/noProcessEnv: cli */
import type { Db } from './scaffold-ops'
import { bold, dim, green, red, yellow } from './ansi'
import { patchRootPackageJson, removeDirs } from './scaffold-ops'
interface InitOpts {
  db: Db
  dir: string
  includeDemos: boolean
}
interface NoboilManifest {
  db: Db
  includeDemos: boolean
  scaffoldedAt: string
  scaffoldedFrom: string
  version: 1
}
const DEFAULT_REPO_URL = 'https://github.com/1qh/noboil'
const REPO_SPEC = env.NOBOIL_REPO ?? DEFAULT_REPO_URL
const REPO_GIT_URL =
  REPO_SPEC.startsWith('/') || REPO_SPEC.startsWith('file://')
    ? REPO_SPEC
    : REPO_SPEC.endsWith('.git')
      ? REPO_SPEC
      : `${REPO_SPEC}.git`
const REPO = REPO_SPEC
/** biome-ignore lint/suspicious/useAwait: readline callback wrapper */
const ask = async (question: string) => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  })
  return new Promise<string>(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}
const run = (cmd: string, args: string[], cwd: string) => {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`${red('Error:')} ${cmd} ${args.join(' ')} failed`)
    process.exit(1)
  }
}
const pruneLibFe = ({ db, dir }: { db: Db; dir: string }) => {
  const feSrc = join(dir, 'lib', 'fe', 'src')
  if (!existsSync(feSrc)) return
  const otherPrefix = db === 'convex' ? 'spacetimedb-' : 'convex-'
  for (const entry of readdirSync(feSrc)) if (entry.startsWith(otherPrefix)) rmSync(join(feSrc, entry))
}
const patchWorkspacePackageJsons = ({ db, dir }: { db: Db; dir: string }) => {
  const walk = (root: string): string[] => {
    const out: string[] = []
    if (!existsSync(root)) return out
    for (const entry of readdirSync(root, { withFileTypes: true }))
      if (entry.isDirectory()) {
        const childRoot = join(root, entry.name)
        const pkg = join(childRoot, 'package.json')
        if (existsSync(pkg)) out.push(pkg)
      }
    return out
  }
  const otherDb = db === 'convex' ? 'spacetimedb' : 'convex'
  const otherBeScope = otherDb === 'convex' ? '@a/be-convex' : '@a/be-spacetimedb'
  const pkgs = [...walk(join(dir, 'lib')), ...walk(join(dir, 'backend')), ...walk(join(dir, 'readonly'))]
  for (const pkgPath of pkgs) {
    const content = readFileSync(pkgPath, 'utf8')
    const pkg = JSON.parse(content) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    let changed = false
    const fixSection = (section?: Record<string, string>) => {
      if (!section) return
      if (section.noboil === 'workspace:*') {
        section.noboil = 'latest'
        changed = true
      }
      if (otherBeScope in section) {
        delete section[otherBeScope]
        changed = true
      }
    }
    fixSection(pkg.dependencies)
    fixSection(pkg.devDependencies)
    fixSection(pkg.peerDependencies)
    if (changed) writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  }
}
const patchTsconfig = ({ db, dir }: { db: Db; dir: string }) => {
  if (db === 'convex') return
  const tsconfigPath = join(dir, 'tsconfig.json')
  if (!existsSync(tsconfigPath)) return
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8')) as {
    compilerOptions?: { customConditions?: string[] }
  }
  tsconfig.compilerOptions ??= {}
  const existing = tsconfig.compilerOptions.customConditions ?? []
  const condition = `noboil-${db}`
  if (!existing.includes(condition)) tsconfig.compilerOptions.customConditions = [...existing, condition]
  writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`)
}
const scaffoldProject = ({ args, db, dir, includeDemos }: InitOpts & { args: string[] }) => {
  const fullPath = resolvePath(process.cwd(), dir)
  if (existsSync(fullPath) && readdirSync(fullPath).length > 0) {
    console.log(`\n${red('Error:')} Directory ${dir} is not empty.\n`)
    process.exit(1)
  }
  console.log(`\n${bold('Creating project...')}\n`)
  console.log(`  ${dim('scaffolding')} ${REPO}...`)
  if (REPO_SPEC.startsWith('/') || REPO_SPEC.startsWith('file://')) {
    run('git', ['clone', '--depth', '1', REPO_GIT_URL, fullPath], process.cwd())
    rmSync(join(fullPath, '.git'), { force: true, recursive: true })
  } else run('bunx', ['-y', 'gitpick', REPO_SPEC, fullPath, '--overwrite'], process.cwd())
  const revResult = spawnSync('git', ['ls-remote', REPO_GIT_URL, 'HEAD'], {
    encoding: 'utf8'
  })
  if (revResult.status !== 0 || !revResult.stdout.trim()) {
    console.error(`${red('Error:')} failed to read scaffold commit hash`)
    process.exit(1)
  }
  const scaffoldedFrom = (revResult.stdout.split('\n')[0] ?? '').split('\t')[0] ?? ''
  console.log(`  ${dim('cleaning up')} unused files...`)
  for (const p of removeDirs({ db, dir: fullPath, includeDemos })) console.log(`  ${dim('removed')} ${p}`)
  console.log(`  ${dim('patching')} package.json files...`)
  patchRootPackageJson({ db, dir: fullPath, includeDemos })
  pruneLibFe({ db, dir: fullPath })
  patchWorkspacePackageJsons({ db, dir: fullPath })
  patchTsconfig({ db, dir: fullPath })
  if (!args.includes('--skip-install')) {
    console.log(`  ${dim('installing')} dependencies...`)
    const installResult = spawnSync('bun', ['install'], {
      cwd: fullPath,
      stdio: 'inherit'
    })
    if (installResult.status !== 0)
      console.log(
        `\n  ${yellow('!')} bun install failed — run ${dim('bun install')} manually after publishing packages.\n`
      )
  }
  console.log(`\n${green('Done!')} Project created at ${bold(dir)}\n`)
  const manifest: NoboilManifest = {
    db,
    includeDemos,
    scaffoldedAt: new Date().toISOString(),
    scaffoldedFrom,
    version: 1
  }
  writeFileSync(join(fullPath, '.noboilrc.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`  ${dim('$')} cd ${dir}`)
  if (db === 'convex') console.log(`  ${dim('$')} bunx convex dev     ${dim('# start Convex backend')}`)
  else console.log(`  ${dim('$')} docker compose up -d ${dim('# start SpacetimeDB')}`)
  console.log(`  ${dim('$')} bun dev              ${dim('# start dev server')}`)
  console.log(`\n${dim('Docs:')} ${yellow('https://noboil.dev/docs')}\n`)
}
const init = async (args: string[]) => {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`\n${bold('noboil init')} — create a new noboil project\n`)
    console.log(bold('Usage:'))
    console.log('  noboil init [directory]\n')
    console.log(bold('Options:'))
    console.log(`  --db=convex|spacetimedb    ${dim('Skip database prompt')}`)
    console.log(`  --no-demos                 ${dim('Skip demo apps')}`)
    console.log(`  --skip-install             ${dim('Skip bun install after scaffolding')}`)
    console.log(`  --help, -h                 ${dim('Show this help')}\n`)
    return
  }
  console.log(`\n${bold('noboil')} ${dim('— schema-first, zero-boilerplate fullstack')}\n`)
  let db: Db | undefined
  let includeDemos = true
  let targetDir = ''
  for (const arg of args)
    if (arg === '--db=convex') db = 'convex'
    else if (arg === '--db=spacetimedb') db = 'spacetimedb'
    else if (arg === '--no-demos') includeDemos = false
    else if (!arg.startsWith('--')) targetDir = arg
  if (!db) {
    console.log(bold('Pick your database:\n'))
    console.log(`  ${bold('1.')} Convex       ${dim('— hosted, reactive queries, server functions')}`)
    console.log(`  ${bold('2.')} SpacetimeDB  ${dim('— self-hosted, subscriptions, Rust module')}\n`)
    const choice = await ask(`${bold('Choice')} ${dim('(1/2)')}: `)
    if (choice === '1' || choice.toLowerCase() === 'convex') db = 'convex'
    else if (choice === '2' || choice.toLowerCase() === 'spacetimedb') db = 'spacetimedb'
    else {
      console.log(`\n${red('Invalid choice.')} Pick 1 or 2.\n`)
      process.exit(1)
    }
  }
  const hasDbFlag = args.some(a => a.startsWith('--db='))
  const hasDemosFlag = args.includes('--no-demos')
  const isNonInteractive = hasDbFlag && (hasDemosFlag || targetDir)
  if (!(hasDemosFlag || isNonInteractive)) {
    const demosAnswer = await ask(`\n${bold('Include demo apps?')} ${dim('(Y/n)')}: `)
    includeDemos = demosAnswer.toLowerCase() !== 'n'
  }
  if (!targetDir) {
    targetDir = await ask(`\n${bold('Project directory')} ${dim('(my-app)')}: `)
    if (!targetDir) targetDir = 'my-app'
  }
  scaffoldProject({ args, db, dir: targetDir, includeDemos })
}
export { init }
