#!/usr/bin/env bun
/* eslint-disable no-console,complexity */

/** biome-ignore-all lint/style/noProcessEnv: cli */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'
import { createInterface } from 'node:readline'

type Db = 'convex' | 'spacetimedb'

interface InitOpts {
  db: Db
  dir: string
  includeDemos: boolean
  includeNative: boolean
}

interface NoboilManifest {
  db: Db
  includeDemos: boolean
  includeNative: boolean
  scaffoldedAt: string
  scaffoldedFrom: string
  version: 1
}

const REPO = '1qh/noboil',
  bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  green = (s: string) => `\u001B[32m${s}\u001B[0m`,
  yellow = (s: string) => `\u001B[33m${s}\u001B[0m`,
  red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  REMOVE_ALWAYS = ['PLAN.md', 'AGENTS.md', 'apps/docs', 'packages/shared', '.github'],
  /** biome-ignore lint/suspicious/useAwait: readline callback wrapper */
  ask = async (question: string) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })

    // oxlint-disable-next-line promise/avoid-new
    return new Promise<string>(resolve => {
      rl.question(question, answer => {
        rl.close()
        resolve(answer.trim())
      })
    })
  },
  run = (cmd: string, args: string[], cwd: string) => {
    const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
    if (result.status !== 0) {
      console.error(`${red('Error:')} ${cmd} ${args.join(' ')} failed`)
      process.exit(1)
    }
  },
  patchOnePackageJson = (filePath: string, lib: string, rootDir: string) => {
    const raw = readFileSync(filePath, 'utf8')
    let content = raw.replaceAll('"workspace:*"', '"latest"')

    if (filePath !== join(rootDir, 'package.json')) {
      const parsed = JSON.parse(content) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      if (parsed.dependencies) {
        const cleaned: Record<string, string> = {}
        for (const [key, val] of Object.entries(parsed.dependencies)) if (!key.startsWith('@a/')) cleaned[key] = val

        cleaned[lib] ??= 'latest'
        parsed.dependencies = cleaned
      }
      if (parsed.devDependencies) {
        const cleaned: Record<string, string> = {}
        for (const [key, val] of Object.entries(parsed.devDependencies)) if (!key.startsWith('@a/')) cleaned[key] = val

        parsed.devDependencies = cleaned
      }
      content = `${JSON.stringify(parsed, null, 2)}\n`
    }

    if (content !== raw) writeFileSync(filePath, content)
  },
  walkAndPatch = (d: string, lib: string, rootDir: string) => {
    const entries = readdirSync(d, { withFileTypes: true })
    for (const entry of entries)
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        const full = join(d, entry.name)
        if (entry.isDirectory()) walkAndPatch(full, lib, rootDir)
        else if (entry.name === 'package.json') patchOnePackageJson(full, lib, rootDir)
      }
  },
  removeDirs = ({ db, dir, includeDemos, includeNative }: InitOpts) => {
    const otherPkg = db === 'convex' ? 'spacetimedb' : 'convex',
      otherBe = db === 'convex' ? 'be-spacetimedb' : 'be-convex',
      otherApps = db === 'convex' ? 'apps/spacetimedb' : 'apps/convex',
      thisApps = db === 'convex' ? 'apps/convex' : 'apps/spacetimedb',
      toRemove = [...REMOVE_ALWAYS, `packages/${otherPkg}`, `packages/${otherBe}`, otherApps]

    if (!includeDemos) toRemove.push(thisApps, `packages/${db === 'convex' ? 'be-convex' : 'be-spacetimedb'}`)

    if (db !== 'convex' || !includeNative) toRemove.push('mobile', 'desktop', 'swift-core')

    for (const p of toRemove) {
      const full = join(dir, p)
      if (existsSync(full)) {
        rmSync(full, { force: true, recursive: true })
        console.log(`  ${dim('removed')} ${p}`)
      }
    }
  },
  patchRootPackageJson = ({ db, dir, includeDemos, includeNative }: InitOpts) => {
    const pkgPath = join(dir, 'package.json'),
      raw = readFileSync(pkgPath, 'utf8'),
      pkg = JSON.parse(raw) as {
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
        ((!includeNative || db !== 'convex') &&
          (key.includes('mobile') || key.includes('desktop') || key.includes('swift'))) ||
        val.includes(otherDb)

    pkg.name = 'my-app'
    pkg.private = undefined

    const workspaces: string[] = []
    if (includeDemos) workspaces.push(`apps/${db}/*`)
    workspaces.push('packages/*')
    pkg.workspaces = workspaces

    if (pkg.scripts) {
      const keep: Record<string, string> = {
        test: db === 'convex' ? 'bun --cwd packages/convex test' : 'bun --cwd packages/spacetimedb test'
      }
      for (const [key, val] of Object.entries(pkg.scripts)) if (!shouldRemove(key, val)) keep[key] = val

      pkg.scripts = keep
    }

    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  },
  scaffoldProject = ({ args, db, dir, includeDemos, includeNative }: InitOpts & { args: string[] }) => {
    const fullPath = resolvePath(process.cwd(), dir)

    if (existsSync(fullPath) && readdirSync(fullPath).length > 0) {
      console.log(`\n${red('Error:')} Directory ${dir} is not empty.\n`)
      process.exit(1)
    }

    console.log(`\n${bold('Creating project...')}\n`)
    console.log(`  ${dim('scaffolding')} ${REPO}...`)
    run('bunx', ['-y', 'degit', REPO, fullPath], process.cwd())
    const revResult = spawnSync('git', ['ls-remote', `https://github.com/${REPO}.git`, 'HEAD'], { encoding: 'utf8' })
    if (revResult.status !== 0 || !revResult.stdout.trim()) {
      console.error(`${red('Error:')} failed to read scaffold commit hash`)
      process.exit(1)
    }
    const scaffoldedFrom = (revResult.stdout.split('\n')[0] ?? '').split('\t')[0] ?? ''

    console.log(`  ${dim('cleaning up')} unused files...`)
    removeDirs({ db, dir: fullPath, includeDemos, includeNative })

    console.log(`  ${dim('patching')} package.json files...`)
    patchRootPackageJson({ db, dir: fullPath, includeDemos, includeNative })
    const lib = db === 'convex' ? '@noboil/convex' : '@noboil/spacetimedb'
    walkAndPatch(fullPath, lib, fullPath)

    if (!args.includes('--skip-install')) {
      console.log(`  ${dim('installing')} dependencies...`)
      const installResult = spawnSync('bun', ['install'], { cwd: fullPath, stdio: 'inherit' })
      if (installResult.status !== 0)
        console.log(
          `\n  ${yellow('!')} bun install failed — run ${dim('bun install')} manually after publishing packages.\n`
        )
    }

    console.log(`\n${green('Done!')} Project created at ${bold(dir)}\n`)
    const manifest: NoboilManifest = {
      db,
      includeDemos,
      includeNative,
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
  },
  init = async (args: string[]) => {
    if (args.includes('--help') || args.includes('-h')) {
      console.log(`\n${bold('noboil init')} — create a new noboil project\n`)
      console.log(bold('Usage:'))
      console.log('  noboil init [directory]\n')
      console.log(bold('Options:'))
      console.log(`  --db=convex|spacetimedb    ${dim('Skip database prompt')}`)
      console.log(`  --no-demos                 ${dim('Skip demo apps')}`)
      console.log(`  --with-native              ${dim('Include mobile/desktop (Convex only)')}`)
      console.log(`  --help, -h                 ${dim('Show this help')}\n`)
      return
    }

    console.log(`\n${bold('noboil')} ${dim('— schema-first, zero-boilerplate fullstack')}\n`)

    let db: Db | undefined,
      includeDemos = true,
      includeNative = false,
      targetDir = ''

    for (const arg of args)
      if (arg === '--db=convex') db = 'convex'
      else if (arg === '--db=spacetimedb') db = 'spacetimedb'
      else if (arg === '--no-demos') includeDemos = false
      else if (arg === '--with-native') includeNative = true
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

    const hasDbFlag = args.some(a => a.startsWith('--db=')),
      hasDemosFlag = args.includes('--no-demos'),
      hasNativeFlag = args.includes('--with-native'),
      isNonInteractive = hasDbFlag && (hasDemosFlag || targetDir)

    if (!(hasDemosFlag || isNonInteractive)) {
      const demosAnswer = await ask(`\n${bold('Include demo apps?')} ${dim('(Y/n)')}: `)
      includeDemos = demosAnswer.toLowerCase() !== 'n'
    }

    if (db === 'convex' && includeDemos && !hasNativeFlag && !isNonInteractive) {
      const nativeAnswer = await ask(`${bold('Include mobile/desktop?')} ${dim('(y/N)')}: `)
      includeNative = nativeAnswer.toLowerCase() === 'y'
    }

    if (!targetDir) {
      targetDir = await ask(`\n${bold('Project directory')} ${dim('(my-app)')}: `)
      if (!targetDir) targetDir = 'my-app'
    }

    scaffoldProject({ args, db, dir: targetDir, includeDemos, includeNative })
  }

export { init }
