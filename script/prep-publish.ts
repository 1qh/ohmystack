#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/max-params, no-await-in-loop, no-console, prefer-named-capture-group */
/** biome-ignore-all lint/nursery/useNamedCaptureGroup: trivial rewrite */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
import { $, file, Glob, write } from 'bun'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, relative } from 'node:path'
const REPO = '/Users/o/z/noboil'
const PKG = `${REPO}/tool/cli`
const STAGING = `${REPO}/node_modules/.publish-staging/noboil`
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
    const targetAbs = `${srcRoot}/ui${sub || '/index'}`
    let relPath = relative(fromDir, targetAbs)
    if (!relPath.startsWith('.')) relPath = `./${relPath}`
    return `${prefix}${quote}${relPath}${quote}`
  }
  let next = orig.replaceAll(/(from\s*)(['"])@a\/ui(\/[^'"]+)?\2/gu, rewrite)
  next = next.replaceAll(/(import\s*\(\s*)(['"])@a\/ui(\/[^'"]+)?\2/gu, rewrite)
  if (next !== orig) {
    touched += 1
    await write(abs, next)
  }
}
console.log(`prep-publish: rewrote @a/ui imports in ${touched} files`)
console.log('prep-publish: ready at', STAGING)
