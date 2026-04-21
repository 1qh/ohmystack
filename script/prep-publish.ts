#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/max-params, no-await-in-loop, no-console, prefer-named-capture-group */
/** biome-ignore-all lint/nursery/useNamedCaptureGroup: trivial rewrite */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
import { $, file, Glob, write } from 'bun'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, relative } from 'node:path'
const REPO = '/Users/o/z/noboil'
const PKG = `${REPO}/tool/cli`
const STAGING = `${REPO}/.cache/publish-staging/noboil`
const UI_IMPORT_RE = /(from\s*)(['"])@a\/ui(\/[^'"]+)?\2/gu
const UI_DYNAMIC_RE = /(import\s*\(\s*)(['"])@a\/ui(\/[^'"]+)?\2/gu
const LEADING_SLASH = /^\//u
const NODE_MODULES_RE = /(['"])([^'"]*)\/node_modules\//gu
const SRC_DIR_RE = /^\.\/src\//u
const TS_EXT_RE = /\.tsx?$/u
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
console.log('prep-publish: staging at', STAGING)
if (existsSync(STAGING)) rmSync(STAGING, { force: true, recursive: true })
mkdirSync(STAGING, { recursive: true })
await $`cp -R ${PKG}/package.json ${STAGING}/package.json`
await $`cp -R ${PKG}/src ${STAGING}/src`
await $`cp -R ${REPO}/readonly/ui/src ${STAGING}/src/ui`
const glob = new Glob('**/*.{ts,tsx}')
const srcRoot = `${STAGING}/src`
const files: string[] = []
for await (const f of glob.scan({ cwd: srcRoot, onlyFiles: true })) files.push(f)
let touched = 0
for (const rel of files) {
  const abs = `${srcRoot}/${rel}`
  const fromDir = dirname(abs)
  const orig = await file(abs).text()
  const rewrite = (_m: string, prefix: string, quote: string, sub = '') => {
    const targetAbs = `${srcRoot}/ui${resolveUiSub(sub)}`
    let relPath = relative(fromDir, targetAbs)
    if (!relPath.startsWith('.')) relPath = `./${relPath}`
    return `${prefix}${quote}${relPath}${quote}`
  }
  let next = orig.replaceAll(UI_IMPORT_RE, rewrite)
  next = next.replaceAll(UI_DYNAMIC_RE, rewrite)
  if (next !== orig) {
    touched += 1
    await write(abs, next)
  }
}
console.log(`prep-publish: rewrote @a/ui imports in ${touched} files`)
await $`cp ${PKG}/tsdown.config.ts ${STAGING}/tsdown.config.ts`
await write(
  `${STAGING}/tsconfig.json`,
  `${JSON.stringify(
    {
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
    },
    null,
    2
  )}\n`
)
console.log('prep-publish: compiling dist with tsdown...')
await $`cd ${STAGING} && bunx tsdown`.quiet()
if (existsSync(`${STAGING}/dist/node_modules`)) {
  console.log('prep-publish: renaming dist/node_modules → dist/vendor (npm strips node_modules)')
  await $`mv ${STAGING}/dist/node_modules ${STAGING}/dist/vendor`
  const distGlob = new Glob('**/*.mjs')
  for await (const f of distGlob.scan({ cwd: `${STAGING}/dist`, onlyFiles: true })) {
    const abs = `${STAGING}/dist/${f}`
    const src = await file(abs).text()
    const next = src.replaceAll(NODE_MODULES_RE, '$1$2/vendor/')
    if (next !== src) await write(abs, next)
  }
}
console.log('prep-publish: patching package.json exports to dist paths...')
const pkgJsonPath = `${STAGING}/package.json`
const pkg = JSON.parse(await file(pkgJsonPath).text()) as Record<string, unknown>
const exportsMap = pkg.exports as Record<string, Record<string, string> | string>
const srcToDist = (p: string) => p.replace(SRC_DIR_RE, './dist/').replace(TS_EXT_RE, '.mjs')
const wrap = (p: string) => ({ default: srcToDist(p), types: p })
for (const [subpath, target] of Object.entries(exportsMap))
  if (typeof target === 'string') exportsMap[subpath] = wrap(target)
  else {
    const next: Record<string, unknown> = {}
    for (const [cond, path] of Object.entries(target)) next[cond] = wrap(path)
    exportsMap[subpath] = next as Record<string, string>
  }
pkg.bin = { noboil: './dist/index.mjs' }
pkg.files = ['dist', 'src', '!src/**/__tests__']
await write(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`)
console.log('prep-publish: ready at', STAGING)
