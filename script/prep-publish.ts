#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/max-params, no-console, prefer-named-capture-group */
/** biome-ignore-all lint/nursery/useNamedCaptureGroup: trivial rewrite */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
import { $, file, Glob, write } from 'bun'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, relative } from 'node:path'
const REPO = '/Users/o/z/noboil'
const PKG = `${REPO}/tool/cli`
const STAGING = `${REPO}/.cache/publish-staging/noboil`
const UI_RE = /((?:from|import\s*\()\s*)(['"])@a\/ui(\/[^'"]+)?\2/gu
const SRC_DIR_RE = /^\.\/src\//u
const TS_EXT_RE = /\.tsx?$/u
const LEADING_SLASH = /^\//u
const resolveUiSub = (sub: string): string => {
  if (!sub) return '/lib/utils'
  const cleaned = sub.replace(LEADING_SLASH, '')
  if (cleaned === 'globals.css') return '/styles/globals.css'
  if (
    cleaned.startsWith('components/') ||
    cleaned.startsWith('hooks/') ||
    cleaned.startsWith('lib/') ||
    cleaned.startsWith('styles/')
  )
    return `/${cleaned}`
  return `/components/${cleaned}`
}
const STAGING_TSCONFIG = {
  compilerOptions: {
    esModuleInterop: true,
    jsx: 'react-jsx',
    lib: ['DOM', 'DOM.Iterable', 'ESNext'],
    module: 'Preserve',
    moduleDetection: 'force',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    target: 'ESNext',
    verbatimModuleSyntax: true
  },
  include: ['src']
}
const srcToDist = (p: string) => p.replace(SRC_DIR_RE, './dist/').replace(TS_EXT_RE, '.mjs')
const srcToDts = (p: string) => p.replace(SRC_DIR_RE, './dist/').replace(TS_EXT_RE, '.d.mts')
const wrap = (p: string) => ({ default: srcToDist(p), types: srcToDts(p) })
console.log('prep-publish: staging at', STAGING)
if (existsSync(STAGING)) rmSync(STAGING, { force: true, recursive: true })
mkdirSync(STAGING, { recursive: true })
await $`cp ${PKG}/package.json ${PKG}/README.md ${PKG}/LICENSE ${PKG}/tsdown.config.ts ${STAGING}/`
await $`cp -R ${PKG}/src ${STAGING}/src`
await $`cp -R ${REPO}/readonly/ui/src ${STAGING}/src/ui`
await write(`${STAGING}/tsconfig.json`, `${JSON.stringify(STAGING_TSCONFIG, null, 2)}\n`)
const srcRoot = `${STAGING}/src`
const glob = new Glob('**/*.{ts,tsx}')
let touched = 0
for await (const rel of glob.scan({ cwd: srcRoot, onlyFiles: true })) {
  const abs = `${srcRoot}/${rel}`
  const fromDir = dirname(abs)
  const orig = await file(abs).text()
  const rewriteUi = (_m: string, prefix: string, quote: string, sub?: string): string => {
    const targetAbs = `${srcRoot}/ui${resolveUiSub(sub ?? '')}`
    let relPath = relative(fromDir, targetAbs)
    if (!relPath.startsWith('.')) relPath = `./${relPath}`
    return `${prefix}${quote}${relPath}${quote}`
  }
  const next = orig.replaceAll(UI_RE, rewriteUi)
  if (next !== orig) {
    touched += 1
    await write(abs, next)
  }
}
console.log(`prep-publish: rewrote @a/ui imports in ${touched} files`)
console.log('prep-publish: compiling dist with tsdown...')
await $`cd ${STAGING} && bunx tsdown`.quiet()
console.log('prep-publish: patching package.json exports to dist paths...')
const pkgJsonPath = `${STAGING}/package.json`
const pkg = JSON.parse(await file(pkgJsonPath).text()) as Record<string, unknown>
const exportsMap = pkg.exports as Record<string, Record<string, string> | string>
for (const [subpath, target] of Object.entries(exportsMap))
  if (typeof target === 'string') exportsMap[subpath] = wrap(target)
  else {
    const next: Record<string, unknown> = {}
    for (const [cond, path] of Object.entries(target)) next[cond] = wrap(path)
    exportsMap[subpath] = next as Record<string, string>
  }
pkg.bin = { noboil: './dist/index.mjs' }
pkg.files = ['dist', 'README.md', 'LICENSE']
await write(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`)
console.log('prep-publish: ready at', STAGING)
