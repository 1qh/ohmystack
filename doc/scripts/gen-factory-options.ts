#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/nursery/noContinue: simple parser */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-iteration extraction */
/* oxlint-disable unicorn/prefer-string-replace-all */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const STDB = `${REPO}/lib/noboil/src/spacetimedb/server`
const FIELD_RE = /^\s*(?<name>\w+)(?<opt>\??):\s*(?<type>[^/\n]+?)\s*(?:\/\/.*)?$/u
const extract = (file: string, name: string): { name: string; opt: string; type: string }[] => {
  const src = readFileSync(file, 'utf8')
  const re = new RegExp(`interface ${name}(?:<[^>]*>)?\\s*\\{([^}]+)\\}`, 'u')
  const m = re.exec(src)
  if (!m?.[1]) return []
  const out: { name: string; opt: string; type: string }[] = []
  for (const line of m[1].split('\n')) {
    const fm = FIELD_RE.exec(line)
    if (fm?.groups?.name && fm.groups.type) {
      const cleanType = fm.groups.type.replaceAll('|', String.raw`\|`).trim().replace(/^\(/u, '(').replace(/\)$/u, ')')
      out.push({ name: fm.groups.name, opt: fm.groups.opt ?? '', type: cleanType })
    }
  }
  return out
}
const formatTable = (rows: { name: string; opt: string; type: string }[]): string => {
  if (rows.length === 0) return '_(none)_'
  const lines = ['| Option | Type | Required |', '|---|---|---|']
  for (const r of rows)
    lines.push(`| \`${r.name}\` | \`${r.type.replaceAll(/\\\|/gu, String.raw`\|`)}\` | ${r.opt ? 'no' : 'yes'} |`)
  return lines.join('\n')
}
const main = () => {
  const log = extract(`${STDB}/log.ts`, 'LogOptions')
  const kv = extract(`${STDB}/kv.ts`, 'KvOptions')
  const blocks = [
    `### log\n\n${formatTable(log)}`,
    `\n### kv\n\n${formatTable(kv)}`,
    '\n### quota\n\n_(no options — only `{ durationMs, limit }` config in schema)_'
  ]
  const body = blocks.join('\n')
  const target = `${REPO}/doc/content/docs/api-reference.mdx`
  const dirty = replaceBetween(target, 'FACTORY-OPTIONS', body)
  console.log(dirty ? `Updated factory options (log:${log.length}, kv:${kv.length})` : 'Factory options up to date')
}
main()
