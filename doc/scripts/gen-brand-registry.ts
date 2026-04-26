#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/nursery/noContinue: simple parser */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const TYPES_PATH = `${REPO}/lib/noboil/src/convex/server/types.ts`
const ENTRY_RE = /(?<brand>\w+):\s*'(?<hint>[^']+)'/u
const main = () => {
  const src = readFileSync(TYPES_PATH, 'utf8')
  const lines = src.split('\n')
  let inBlock = false
  const rows: string[] = []
  for (const line of lines) {
    if (line.includes('interface SchemaHintMap')) {
      inBlock = true
      continue
    }
    if (!inBlock) continue
    if (line.trim() === '}') break
    const m = ENTRY_RE.exec(line)
    if (m?.groups?.brand && m.groups.hint) {
      const safeHint = m.groups.hint.replaceAll('{', String.raw`\{`).replaceAll('}', String.raw`\}`)
      rows.push(`| \`${m.groups.brand}\` | ${safeHint} |`)
    }
  }
  rows.sort()
  const table = ['| Brand | Maker → Factory + Wrapper |', '|---|---|', ...rows].join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'BRAND-REGISTRY', table)
  console.log(
    dirty ? `Updated brand registry (${rows.length} entries)` : `Brand registry up to date (${rows.length} entries)`
  )
}
main()
