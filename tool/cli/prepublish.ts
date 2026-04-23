#!/usr/bin/env bun
/* eslint-disable no-console */
import { $, file, write } from 'bun'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
const PKG = import.meta.dirname
const OUT = `${PKG}/.publish`
const SRC_RE = /^\.\/src\//u
const TS_EXT_RE = /\.tsx?$/u
const srcToDist = (p: string) => p.replace(SRC_RE, './dist/').replace(TS_EXT_RE, '.mjs')
const srcToDts = (p: string) => p.replace(SRC_RE, './dist/').replace(TS_EXT_RE, '.d.mts')
const wrap = (p: string) => ({ default: srcToDist(p), types: srcToDts(p) })
console.log('prepublish: compiling dist with tsdown...')
await $`cd ${PKG} && bunx tsdown`.quiet()
console.log('prepublish: staging publish root at', OUT)
if (existsSync(OUT)) rmSync(OUT, { force: true, recursive: true })
mkdirSync(OUT, { recursive: true })
await $`cp -R ${PKG}/dist ${OUT}/dist`
await $`cp ${PKG}/README.md ${PKG}/LICENSE ${OUT}/`
const pkg = JSON.parse(await file(`${PKG}/package.json`).text()) as Record<string, unknown>
const exportsMap = pkg.exports as Record<string, Record<string, string> | string>
for (const [sub, target] of Object.entries(exportsMap))
  if (typeof target === 'string') exportsMap[sub] = wrap(target)
  else {
    const next: Record<string, unknown> = {}
    for (const [cond, path] of Object.entries(target)) next[cond] = wrap(path)
    exportsMap[sub] = next as Record<string, string>
  }
pkg.bin = Object.fromEntries(
  Object.entries(pkg.bin as Record<string, string>).map(([name, src]) => [name, srcToDist(src)])
)
pkg.files = ['dist', 'README.md', 'LICENSE']
Reflect.deleteProperty(pkg, 'devDependencies')
await write(`${OUT}/package.json`, `${JSON.stringify(pkg, null, 2)}\n`)
console.log('prepublish: ready at', OUT)
