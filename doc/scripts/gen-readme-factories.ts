#!/usr/bin/env bun
/* eslint-disable no-console */
import { resolve } from 'node:path'
import { FACTORY_META } from '../../lib/noboil/src/shared/factory-meta'
import { replaceLineBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const SKIP = new Set(['orgDef'])
const main = () => {
  const rows = Object.entries(FACTORY_META)
    .filter(([brand]) => !SKIP.has(brand))
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([brand, m]) => `| \`${brand}\` | ${m.shape} | ${m.generates} | ${m.useFor} |`)
  const body = ['| Factory | Shape | Generates | Use for |', '|---|---|---|---|', ...rows].join('\n')
  const target = `${REPO}/README.md`
  const dirty = replaceLineBetween(target, 'FACTORY-TABLE', body)
  console.log(
    dirty
      ? `Updated README factory table (${rows.length} factories)`
      : `README factory table up to date (${rows.length} factories)`
  )
}
main()
