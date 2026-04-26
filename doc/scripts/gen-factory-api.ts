#!/usr/bin/env bun
/* eslint-disable no-console, no-template-curly-in-string */
/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: literal placeholder */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const STDB = `${REPO}/lib/noboil/src/spacetimedb/server`
const NAME_RE = /(?<role>\w+)Name\s*=\s*`(?<tpl>[^`]+)`/u
const extract = (file: string): { role: string; tpl: string }[] => {
  const out: { role: string; tpl: string }[] = []
  const src = readFileSync(file, 'utf8')
  for (const line of src.split('\n')) {
    const m = NAME_RE.exec(line)
    if (m?.groups?.role && m.groups.tpl) out.push({ role: m.groups.role, tpl: m.groups.tpl })
  }
  return out
}
const factoryRow = (factory: string, names: { role: string; tpl: string }[]): string => {
  const cells = names.map(n => `\`${n.tpl.replaceAll('${tableName}', '{table}')}\``).join(', ')
  return `| \`${factory}\` | ${cells || '_(none)_'} |`
}
const main = () => {
  const log = extract(`${STDB}/log.ts`)
  const kv = extract(`${STDB}/kv.ts`)
  const quota = extract(`${STDB}/quota.ts`)
  const table = [
    '| Factory | SpacetimeDB-generated reducer names |',
    '|---|---|',
    factoryRow('log', log),
    factoryRow('kv', kv),
    factoryRow('quota', quota)
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
