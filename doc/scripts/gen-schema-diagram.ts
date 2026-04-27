#!/usr/bin/env bun
/* eslint-disable no-console, no-continue, complexity */
/** biome-ignore-all lint/performance/useTopLevelRegex: parsed once */
/** biome-ignore-all lint/nursery/noContinue: parser */
/** biome-ignore-all lint/correctness/noUnusedVariables: ZID_RE reserved for future use */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const SLOTS = ['base', 'children', 'kv', 'log', 'org', 'orgScoped', 'owned', 'quota', 'singleton']
const findSlotBody = (src: string, slot: string): string => {
  const re = new RegExp(`\\n\\s*${slot}:\\s*\\{`, 'u')
  const m = re.exec(src)
  if (!m) return ''
  const start = m.index + m[0].length
  let depth = 1
  let i = start
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') depth -= 1
    i += 1
  }
  return src.slice(start, i - 1)
}
const tableNames = (body: string): string[] => {
  const re = /\n\s*(?<name>\w+):\s*(?:object\(|child\(|\{|orgSchema)/gu
  const out: string[] = []
  let m = re.exec(body)
  while (m) {
    if (m.groups?.name) out.push(m.groups.name)
    m = re.exec(body)
  }
  return out
}
const PARENT_RE = /(?<table>\w+):\s*child\(\{[^}]*?parent:\s*'(?<parent>\w+)'/gu
const FK_RE = /(?<table>\w+):\s*\{[^}]*?parent:\s*'(?<parent>\w+)'/gu
const main = () => {
  const src = readFileSync(`${REPO}/backend/convex/s.ts`, 'utf8')
  const slotMap: Record<string, string[]> = {}
  for (const slot of SLOTS) slotMap[slot] = tableNames(findSlotBody(src, slot))
  const allTables = new Set<string>()
  for (const list of Object.values(slotMap)) for (const t of list) allTables.add(t)
  const edges: { from: string; label: string; to: string }[] = []
  let m = PARENT_RE.exec(src)
  while (m) {
    if (m.groups?.table && m.groups.parent) edges.push({ from: m.groups.table, label: 'parent', to: m.groups.parent })
    m = PARENT_RE.exec(src)
  }
  PARENT_RE.lastIndex = 0
  m = FK_RE.exec(src)
  while (m) {
    if (m.groups?.table && m.groups.parent && allTables.has(m.groups.parent))
      edges.push({ from: m.groups.table, label: 'parent', to: m.groups.parent })
    m = FK_RE.exec(src)
  }
  FK_RE.lastIndex = 0
  const seen = new Set<string>()
  const dedupedEdges = edges.filter(e => {
    const key = `${e.from}->${e.to}:${e.label}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const lazySrc = readFileSync(`${REPO}/backend/convex/lazy.ts`, 'utf8')
  const cascadeRe = /(?<table>\w+):\s*table\(s\.\w+,\s*\{[^}]*?cascade:[^}]*?table:\s*s\.(?<target>\w+)\.__name/gu
  let cm = cascadeRe.exec(lazySrc)
  while (cm) {
    if (cm.groups?.table && cm.groups.target)
      dedupedEdges.push({ from: cm.groups.table, label: 'cascade', to: cm.groups.target })
    cm = cascadeRe.exec(lazySrc)
  }
  cascadeRe.lastIndex = 0
  const aclFromRe = /(?<table>\w+):\s*table\(s\.\w+,\s*\{[^}]*?aclFrom:\s*\{[^}]*?table:\s*s\.(?<target>\w+)\.__name/gu
  let am = aclFromRe.exec(lazySrc)
  while (am) {
    if (am.groups?.table && am.groups.target)
      dedupedEdges.push({ from: am.groups.table, label: 'aclFrom', to: am.groups.target })
    am = aclFromRe.exec(lazySrc)
  }
  aclFromRe.lastIndex = 0
  const slotColor: Record<string, string> = {
    base: '#fef3c7',
    children: '#fce7f3',
    kv: '#e0e7ff',
    log: '#dcfce7',
    org: '#fef9c3',
    orgScoped: '#fed7aa',
    owned: '#dbeafe',
    quota: '#fee2e2',
    singleton: '#f3e8ff'
  }
  const lines = ['```mermaid', 'graph LR']
  for (const slot of SLOTS) {
    const tables = slotMap[slot] ?? []
    if (tables.length === 0) continue
    lines.push(`  subgraph ${slot}`)
    for (const t of tables) lines.push(`    ${t}["${t}"]`)
    lines.push('  end')
  }
  for (const e of dedupedEdges) lines.push(`  ${e.from} -->|${e.label}| ${e.to}`)
  for (const slot of SLOTS) {
    const color = slotColor[slot] ?? '#fff'
    for (const t of slotMap[slot] ?? []) lines.push(`  style ${t} fill:${color},stroke:#333`)
  }
  lines.push('```')
  const body = [
    `**${allTables.size} tables, ${dedupedEdges.length} relationships** (parent / cascade / aclFrom). Color = factory slot.`,
    '',
    ...lines
  ].join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'SCHEMA-DIAGRAM', body)
  console.log(
    dirty ? `Updated schema diagram (${allTables.size} tables, ${dedupedEdges.length} edges)` : 'Schema diagram up to date'
  )
}
main()
