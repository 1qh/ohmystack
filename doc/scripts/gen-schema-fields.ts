#!/usr/bin/env bun
/* eslint-disable no-console, no-continue, complexity */
/** biome-ignore-all lint/performance/useTopLevelRegex: parsed once */
/** biome-ignore-all lint/nursery/noContinue: parser */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const SLOTS = ['base', 'children', 'kv', 'log', 'org', 'orgScoped', 'owned', 'quota', 'singleton'] as const
const escapeMd = (s: string): string =>
  s
    .replaceAll('|', String.raw`\|`)
    .replaceAll('{', String.raw`\{`)
    .replaceAll('}', String.raw`\}`)
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
const SKIP_KEYS = new Set([
  'durationMs',
  'foreignKey',
  'index',
  'keys',
  'limit',
  'parent',
  'parentSchema',
  'schema',
  'writeRole'
])
const main = () => {
  const lines = readFileSync(`${REPO}/backend/convex/s.ts`, 'utf8').split('\n')
  let inSchema = false
  let depth = 0
  let currentSlot = ''
  let currentTable = ''
  let tableIndent = -1
  const tableFields = new Map<string, { fields: { name: string; type: string }[]; slot: string }>()
  for (const raw of lines) {
    const trimmed = raw.trim()
    if (!inSchema) {
      if (raw.includes('schema({')) {
        inSchema = true
        depth = 1
      }
      continue
    }
    for (const ch of raw)
      if (ch === '{' || ch === '(') depth += 1
      else if (ch === '}' || ch === ')') depth -= 1
    if (depth <= 0) {
      inSchema = false
      continue
    }
    const slotMatch = /^\s{2}(?<slot>\w+):\s*\{/u.exec(raw)
    if (slotMatch?.groups?.slot && SLOTS.includes(slotMatch.groups.slot as (typeof SLOTS)[number])) {
      currentSlot = slotMatch.groups.slot
      currentTable = ''
      continue
    }
    const tableMatch = /^(?<indent>\s+)(?<name>\w+):\s*(?:object\(\{|child\(\{|\{|orgSchema)/u.exec(raw)
    if (tableMatch?.groups?.indent && tableMatch.groups.name && tableMatch.groups.indent.length === 4 && currentSlot) {
      currentTable = tableMatch.groups.name
      tableIndent = tableMatch.groups.indent.length
      tableFields.set(currentTable, { fields: [], slot: currentSlot })
      continue
    }
    if (currentTable) {
      const indent = raw.length - raw.trimStart().length
      if (indent <= tableIndent) {
        currentTable = ''
        continue
      }
      const fieldMatch = /^\s+(?<fname>\w+):\s*(?<ftype>.+?)[,]?$/u.exec(raw)
      if (fieldMatch?.groups?.fname && fieldMatch.groups.ftype && !SKIP_KEYS.has(fieldMatch.groups.fname)) {
        const t = fieldMatch.groups.ftype.trim().replace(/[,;]+$/u, '')
        if (t && !t.startsWith('//') && !t.startsWith('object('))
          tableFields.get(currentTable)?.fields.push({ name: fieldMatch.groups.fname, type: t })
      }
    }
    if (trimmed.startsWith('//') || trimmed === '') continue
  }
  const sections: string[] = []
  let totalTables = 0
  let totalFields = 0
  const bySlot = new Map<string, { fields: { name: string; type: string }[]; name: string }[]>()
  for (const [name, info] of tableFields) {
    const arr = bySlot.get(info.slot) ?? []
    arr.push({ fields: info.fields, name })
    bySlot.set(info.slot, arr)
  }
  for (const slot of SLOTS) {
    const tables = bySlot.get(slot)
    if (!tables || tables.length === 0) continue
    sections.push(`### slot: \`${slot}\``)
    sections.push('')
    for (const { fields, name } of tables.toSorted((a, b) => a.name.localeCompare(b.name))) {
      totalTables += 1
      totalFields += fields.length
      sections.push(`**\`${name}\`** — ${fields.length} field(s)`)
      sections.push('')
      if (fields.length === 0) sections.push('_(no inline fields parsed — see source)_')
      else {
        sections.push('| Field | Zod chain |')
        sections.push('|---|---|')
        for (const f of fields) sections.push(`| \`${f.name}\` | \`${escapeMd(f.type)}\` |`)
      }
      sections.push('')
    }
  }
  const body = [
    `Auto-extracted from \`backend/convex/s.ts\`. **${totalTables} tables, ${totalFields} user-defined fields** (auto-injected fields like \`userId\`/\`updatedAt\` are added by factories — see [auto-fields](#schema-branding) above).`,
    '',
    ...sections
  ].join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'SCHEMA-FIELDS', body)
  console.log(dirty ? `Updated schema fields (${totalTables} tables, ${totalFields} fields)` : 'Schema fields up to date')
}
main()
