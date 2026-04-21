#!/usr/bin/env bun
/* eslint-disable no-console */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const target = join(import.meta.dir, '..', 'node_modules', 'spacetimedb', 'dist', 'server', 'index.mjs')
if (!existsSync(target)) process.exit(0)
const src = readFileSync(target, 'utf8')
const marker = '/* patched: stdb-sys-stub */'
if (src.includes(marker)) process.exit(0)
const stub = `${marker}
const _noop = new Proxy(function () { return _noop }, {
  get: (t, p) => p === Symbol.toPrimitive ? () => '' : (t[p] ?? _noop)
})
const _syscalls2_0 = new Proxy({}, { get: () => _noop })
const moduleHooks = _noop
`
const patched = src
  .replace(/^import \* as _syscalls2_0 from 'spacetime:sys@2\.0';\n?/mu, '')
  .replace(/^import \{ moduleHooks \} from 'spacetime:sys@2\.0';\n?/mu, '')
const out = stub + patched
writeFileSync(target, out)
console.log('patched', target)
