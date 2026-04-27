#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/performance/useTopLevelRegex: small file */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const FIELD_RE = /^\s*(?<name>\w+)(?<opt>\??):\s*(?<type>[^\n]+)$/u
const escapeMd = (s: string): string =>
  s
    .replaceAll('|', String.raw`\|`)
    .replaceAll('{', String.raw`\{`)
    .replaceAll('}', String.raw`\}`)
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
const parseInterface = (src: string, name: string): { name: string; opt: boolean; type: string }[] => {
  const start = src.indexOf(`interface ${name}`)
  if (start === -1) return []
  const open = src.indexOf('{', start)
  let depth = 1
  let i = open + 1
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') depth -= 1
    i += 1
  }
  const body = src.slice(open + 1, i - 1)
  const fields: { name: string; opt: boolean; type: string }[] = []
  for (const line of body.split('\n')) {
    const m = FIELD_RE.exec(line)
    if (m?.groups?.name && m.groups.type)
      fields.push({ name: m.groups.name, opt: m.groups.opt === '?', type: m.groups.type.trim() })
  }
  return fields
}
const main = () => {
  const src = readFileSync(`${REPO}/lib/noboil/src/convex/server/types.ts`, 'utf8')
  const fields = parseInterface(src, 'SetupConfig')
  const rows = fields
    .toSorted((a, b) => Number(a.opt) - Number(b.opt) || a.name.localeCompare(b.name))
    .map(f => `| \`${f.name}${f.opt ? '?' : ''}\` | \`${escapeMd(f.type)}\` | ${f.opt ? 'optional' : '**required**'} |`)
  const body = [
    `Plus \`tables: ({ table }) => ({ ... })\` callback (always required). ${fields.length} top-level options on \`SetupConfig\`:`,
    '',
    '| Field | Type | Required |',
    '|---|---|---|',
    ...rows
  ].join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'NOBOIL-OPTIONS', body)
  console.log(dirty ? `Updated noboil() options (${fields.length})` : `noboil() options up to date (${fields.length})`)
}
main()
