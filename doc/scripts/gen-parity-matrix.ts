#!/usr/bin/env bun
/* eslint-disable no-console */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const FEATURES = [
  { file: 'crud.ts', name: 'owned CRUD' },
  { file: 'org-crud.ts', name: 'org-scoped CRUD' },
  { file: 'child.ts', name: 'child CRUD' },
  { file: 'singleton.ts', name: 'singleton (1-per-user)' },
  { file: 'cache-crud.ts', name: 'cache (TTL + refresh)' },
  { file: 'log.ts', name: 'log (append-only)' },
  { file: 'kv.ts', name: 'kv (string-keyed)' },
  { file: 'quota.ts', name: 'quota (sliding window)' },
  { file: 'org.ts', name: 'org schema (membership + invites)' },
  { file: 'org-members.ts', name: 'org members API' },
  { file: 'org-invites.ts', name: 'org invites API' },
  { file: 'org-join.ts', name: 'org join requests' },
  { file: 'presence.ts', name: 'presence' },
  { file: 'file.ts', name: 'file uploads' },
  { file: 'middleware.ts', name: 'middleware (audit, sanitize, slow-warn)' }
]
const has = (kind: 'convex' | 'spacetimedb', file: string): boolean =>
  existsSync(`${REPO}/lib/noboil/src/${kind}/server/${file}`)
const sloc = (kind: 'convex' | 'spacetimedb', file: string): number => {
  const path = `${REPO}/lib/noboil/src/${kind}/server/${file}`
  if (!existsSync(path)) return 0
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('//')).length
}
const main = () => {
  const rows: string[] = []
  for (const f of FEATURES) {
    const cvx = has('convex', f.file) ? `✓ (${sloc('convex', f.file)} loc)` : '—'
    const stdb = has('spacetimedb', f.file) ? `✓ (${sloc('spacetimedb', f.file)} loc)` : '—'
    rows.push(`| ${f.name} | \`${f.file}\` | ${cvx} | ${stdb} |`)
  }
  const body = ['| Feature | Source file | Convex | SpacetimeDB |', '|---|---|---|---|', ...rows].join('\n')
  const target = `${REPO}/doc/content/docs/differences.mdx`
  const dirty = replaceBetween(target, 'PARITY-MATRIX', body)
  console.log(
    dirty
      ? `Updated parity matrix (${FEATURES.length} features)`
      : `Parity matrix up to date (${FEATURES.length} features)`
  )
}
main()
