#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/performance/useTopLevelRegex: install-time patch */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const target = join(import.meta.dir, '..', 'node_modules', 'spacetimedb', 'dist', 'server', 'index.mjs')
const backup = `${target}.orig`
const marker = '/* patched: stdb-sys-stub */'
const patchServer = (): void => {
  if (!existsSync(target)) return
  const src = readFileSync(target, 'utf8')
  if (src.includes(marker)) return
  if (!existsSync(backup)) copyFileSync(target, backup)
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
  writeFileSync(target, stub + patched)
  console.log('patched', target)
}
patchServer()
const REACT_VARIANTS = ['dist/react/index.mjs', 'dist/browser/react/index.mjs']
const REACT_MARKER = '/* patched: useTable-deps */'
const patchReact = (path: string): void => {
  if (!existsSync(path)) return
  const content = readFileSync(path, 'utf8')
  if (content.includes(REACT_MARKER)) return
  const fixed = content
    .replaceAll(
      '}, [querySql, connectionState.isActive, connectionState]);',
      `}, [querySql, connectionState.isActive]);${REACT_MARKER}`
    )
    .replaceAll(
      /\[\s*connectionState,\s*accessorName,\s*querySql,\s*computeSnapshot,\s*callbacks\?\.onDelete,\s*callbacks\?\.onInsert,\s*callbacks\?\.onUpdate\s*\]/gu,
      '[connectionState.isActive, accessorName, querySql, computeSnapshot, callbacks?.onDelete, callbacks?.onInsert, callbacks?.onUpdate]'
    )
    .replaceAll(
      '}, [connectionState, accessorName, querySql, subscribeApplied]);',
      '}, [connectionState.isActive, accessorName, querySql, subscribeApplied]);'
    )
  if (fixed === content) return
  writeFileSync(path, fixed)
  console.log('patched useTable deps in', path)
}
for (const rel of REACT_VARIANTS) patchReact(join(import.meta.dir, '..', 'node_modules', 'spacetimedb', rel))
