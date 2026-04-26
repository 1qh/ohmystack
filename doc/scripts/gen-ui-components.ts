#!/usr/bin/env bun
/* eslint-disable no-console */
import { readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const main = () => {
  const root = `${REPO}/readonly/ui/src/components`
  const top = readdirSync(root)
    .filter(f => f.endsWith('.tsx'))
    .map(f => f.slice(0, -'.tsx'.length))
    .toSorted()
  const subdirs = readdirSync(root)
    .filter(f => statSync(`${root}/${f}`).isDirectory())
    .toSorted()
  const subLines: string[] = []
  for (const sub of subdirs) {
    const items = readdirSync(`${root}/${sub}`)
      .filter(f => f.endsWith('.tsx'))
      .map(f => f.slice(0, -'.tsx'.length))
      .toSorted()
    if (items.length > 0) subLines.push(`- **${sub}** (${items.length}): ${items.map(i => `\`${i}\``).join(', ')}`)
  }
  const list = top.map(c => `\`${c}\``).join(', ')
  const body = [`**${top.length} top-level components:** ${list}`, '', ...subLines].join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'UI-COMPONENTS', body)
  console.log(dirty ? `Updated UI components list (${top.length})` : `UI components list up to date (${top.length})`)
}
main()
