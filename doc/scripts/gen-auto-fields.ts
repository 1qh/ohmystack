#!/usr/bin/env bun
/* eslint-disable no-console */
import { resolve } from 'node:path'
import { FACTORY_META } from '../../lib/noboil/src/shared/factory-meta'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const DOC_LINK: Record<string, string> = { kv: './kv', log: './log', quota: './quota' }
const escapeMd = (s: string): string =>
  s.replaceAll('|', String.raw`\|`).replaceAll('{', String.raw`\{`).replaceAll('}', String.raw`\}`)
const main = () => {
  const rows: string[] = [
    '| Slot | Brand | Wrapper | Auto-injected fields | Indexes | Description |',
    '|---|---|---|---|---|---|'
  ]
  for (const [brand, meta] of Object.entries(FACTORY_META).toSorted(([a], [b]) => a.localeCompare(b))) {
    const fields = meta.autoFields.map(f => `\`${f}\``).join(', ')
    const indexes = meta.indexes.map(i => `\`${i}\``).join(', ')
    const link = DOC_LINK[brand] ? ` ([${brand}](${DOC_LINK[brand]}))` : ''
    rows.push(
      `| \`${meta.slot}\` | \`${brand}\` | \`${escapeMd(meta.wrapper)}\` | ${escapeMd(fields)} | ${escapeMd(indexes)} | ${meta.description}${link} |`
    )
  }
  const body = rows.join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'AUTO-FIELDS', body)
  console.log(
    dirty
      ? `Updated auto-fields table (${Object.keys(FACTORY_META).length} brands)`
      : `Auto-fields table up to date (${Object.keys(FACTORY_META).length} brands)`
  )
}
main()
