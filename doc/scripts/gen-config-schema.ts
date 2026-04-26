#!/usr/bin/env bun
/* eslint-disable no-console */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const FIELD_RE = /^(?<n>\w+)(?<o>\??):\s*(?<t>[\s\S]+)$/u
const WS_RE = /\s+/gu
const TRAILING_SEMI_RE = /;$/u
interface Field {
  name: string
  optional: boolean
  type: string
}
const findInterfaceBody = (src: string, name: string): string => {
  const start = src.indexOf(`interface ${name}`)
  if (start === -1) return ''
  const open = src.indexOf('{', start)
  if (open === -1) return ''
  let depth = 1
  let i = open + 1
  while (i < src.length && depth > 0) {
    const ch = src[i]
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
    i += 1
  }
  return src.slice(open + 1, i - 1)
}
const splitMembers = (body: string): string[] => {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of body) {
    if (ch === '{' || ch === '(' || ch === '[') depth += 1
    else if (ch === '}' || ch === ')' || ch === ']') depth -= 1
    if (depth === 0 && (ch === '\n' || ch === ';')) {
      const t = cur.trim()
      if (t) out.push(t)
      cur = ''
    } else cur += ch
  }
  const t = cur.trim()
  if (t) out.push(t)
  return out
}
const parseInterface = (src: string, name: string): Field[] => {
  const body = findInterfaceBody(src, name)
  if (!body) return []
  const fields: Field[] = []
  for (const member of splitMembers(body)) {
    const fm = FIELD_RE.exec(member)
    if (fm?.groups) {
      const type = (fm.groups.t ?? '').replaceAll(WS_RE, ' ').trim().replace(TRAILING_SEMI_RE, '')
      fields.push({ name: fm.groups.n ?? '', optional: fm.groups.o === '?', type })
    }
  }
  return fields
}
const escapeMd = (s: string): string =>
  s
    .replaceAll('|', String.raw`\|`)
    .replaceAll('{', String.raw`\{`)
    .replaceAll('}', String.raw`\}`)
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
const renderTable = (title: string, fields: Field[]): string => {
  const rows = fields.map(f => `| \`${f.name}${f.optional ? '?' : ''}\` | \`${escapeMd(f.type)}\` |`)
  return [`**${title}**`, '', '| Field | Type |', '|---|---|', ...rows].join('\n')
}
const main = () => {
  const src = readFileSync(`${REPO}/lib/noboil/src/config.ts`, 'utf8')
  const cfg = parseInterface(src, 'NoboilConfig')
  const ctx = parseInterface(src, 'AddContext')
  const cft = parseInterface(src, 'CustomFieldType')
  const body = [
    renderTable('NoboilConfig', cfg),
    '',
    renderTable('AddContext (passed to beforeAdd / afterAdd)', ctx),
    '',
    renderTable('CustomFieldType (entries of fieldTypes)', cft)
  ].join('\n')
  const target = `${REPO}/doc/content/docs/cli.mdx`
  const dirty = replaceBetween(target, 'CONFIG-SCHEMA', body)
  console.log(dirty ? 'Updated config schema tables' : 'Config schema tables up to date')
}
main()
