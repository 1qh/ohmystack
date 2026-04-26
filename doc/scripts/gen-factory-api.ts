#!/usr/bin/env bun
/* eslint-disable no-console, no-template-curly-in-string, no-continue */
/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: literal placeholder */
/** biome-ignore-all lint/nursery/noContinue: simple parser */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-iteration scan */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const STDB = `${REPO}/lib/noboil/src/spacetimedb/server`
const NAME_RE = /(?<role>\w+)Name\s*=\s*`(?<tpl>[^`]+)`/u
const JSDOC_RE = /^\s*\/\*\*\s*(?<text>.+?)\s*\*\/\s*$/u
interface Entry {
  doc: string
  role: string
  tpl: string
}
const extract = (file: string): Entry[] => {
  const out: Entry[] = []
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  let pendingDoc = ''
  for (const line of lines) {
    const docMatch = JSDOC_RE.exec(line)
    if (docMatch?.groups?.text) {
      pendingDoc = docMatch.groups.text
      continue
    }
    const m = NAME_RE.exec(line)
    if (m?.groups?.role && m.groups.tpl) {
      out.push({ doc: pendingDoc, role: m.groups.role, tpl: m.groups.tpl })
      pendingDoc = ''
    } else if (line.trim() && !line.trim().startsWith('//')) pendingDoc = ''
  }
  return out
}
const factoryRows = (factory: string, names: Entry[]): string[] => {
  if (names.length === 0) return [`| \`${factory}\` | _(none)_ | _(none)_ |`]
  return names.map((n, i) => {
    const tpl = `\`${n.tpl.replaceAll('${tableName}', '{table}')}\``
    const desc = n.doc.replaceAll('|', String.raw`\|`)
    return `| ${i === 0 ? `\`${factory}\`` : ' '} | ${tpl} | ${desc} |`
  })
}
const main = () => {
  const log = extract(`${STDB}/log.ts`)
  const kv = extract(`${STDB}/kv.ts`)
  const quota = extract(`${STDB}/quota.ts`)
  const table = [
    '| Factory | Reducer | Description |',
    '|---|---|---|',
    ...factoryRows('log', log),
    ...factoryRows('kv', kv),
    ...factoryRows('quota', quota)
  ].join('\n')
  const target = `${REPO}/doc/content/docs/api-reference.mdx`
  const dirty = replaceBetween(target, 'STDB-FACTORY-REDUCERS', table)
  console.log(
    dirty
      ? `Updated stdb factory reducer names (log:${log.length}, kv:${kv.length}, quota:${quota.length})`
      : 'Stdb factory reducer names up to date'
  )
}
main()
