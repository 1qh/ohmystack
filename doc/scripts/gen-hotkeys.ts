#!/usr/bin/env bun
/* eslint-disable no-console */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceLineBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const ROW_RE =
  /\{\s*action:\s*'(?<action>[^']+)',\s*desc:\s*'(?<desc>[^']+)',\s*key:\s*'(?<key>[^']+)',\s*name:\s*'(?<name>[^']+)'\s*\}/gu
const main = () => {
  const src = readFileSync(`${REPO}/lib/noboil/src/dashboard-tui.tsx`, 'utf8')
  const rows: string[] = []
  let m = ROW_RE.exec(src)
  while (m) {
    if (m.groups) rows.push(`| \`${m.groups.key}\` | \`${m.groups.name}\` | ${m.groups.desc} |`)
    m = ROW_RE.exec(src)
  }
  ROW_RE.lastIndex = 0
  const body = ['| key | command | what it does |', '| --- | --- | --- |', ...rows].join('\n')
  const target = `${REPO}/README.md`
  const dirty = replaceLineBetween(target, 'HOTKEYS', body)
  console.log(
    dirty ? `Updated hotkeys table (${rows.length} entries)` : `Hotkeys table up to date (${rows.length} entries)`
  )
}
main()
