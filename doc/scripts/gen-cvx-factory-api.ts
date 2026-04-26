#!/usr/bin/env bun
/* eslint-disable no-console, prefer-named-capture-group */
/** biome-ignore-all lint/nursery/noContinue: simple parser */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-iteration scan */
/** biome-ignore-all lint/nursery/useNamedCaptureGroup: simple match */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const CVX = `${REPO}/lib/noboil/src/convex/server`
const ENDPOINT_RE = /^\s*const\s+(?<name>\w+)\s*=\s*b\.(?<kind>[qm])\(/u
const RETURN_RE = /return\s+typed\(\{\s*([^}]+)\s*\}\)/u
const extract = (file: string): { kind: 'm' | 'q'; name: string }[] => {
  const src = readFileSync(file, 'utf8')
  const out: { kind: 'm' | 'q'; name: string }[] = []
  for (const line of src.split('\n')) {
    const m = ENDPOINT_RE.exec(line)
    if (m?.groups?.name && m.groups.kind) out.push({ kind: m.groups.kind as 'm' | 'q', name: m.groups.name })
  }
  const rm = RETURN_RE.exec(src)
  if (!rm?.[1]) return out
  const exported = new Set<string>()
  for (const part of rm[1].split(',')) {
    const trimmed = part.trim().replace(/:.+$/u, '').trim()
    if (trimmed) exported.add(trimmed)
  }
  return out.filter(e => exported.has(e.name))
}
const formatRow = (factory: string, names: { kind: 'm' | 'q'; name: string }[]): string => {
  const cells = names
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map(n => `\`${n.name}\` (${n.kind === 'q' ? 'query' : 'mutation'})`)
    .join(', ')
  return `| \`${factory}\` | ${cells || '_(none)_'} |`
}
const main = () => {
  const log = extract(`${CVX}/log.ts`)
  const kv = extract(`${CVX}/kv.ts`)
  const quota = extract(`${CVX}/quota.ts`)
  const table = [
    '| Factory | Convex-generated endpoints |',
    '|---|---|',
    formatRow('log', log),
    formatRow('kv', kv),
    formatRow('quota', quota)
  ].join('\n')
  const target = `${REPO}/doc/content/docs/api-reference.mdx`
  const dirty = replaceBetween(target, 'CVX-FACTORY-ENDPOINTS', table)
  console.log(
    dirty
      ? `Updated cvx factory endpoints (log:${log.length}, kv:${kv.length}, quota:${quota.length})`
      : 'Cvx factory endpoints up to date'
  )
}
main()
