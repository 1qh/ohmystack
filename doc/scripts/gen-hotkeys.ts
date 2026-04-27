#!/usr/bin/env bun
/* eslint-disable no-console */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceLineBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const ROW_RE =
  /\{\s*action:\s*'(?<action>[^']+)',\s*desc:\s*'(?<desc>[^']+)',\s*key:\s*'(?<key>[^']+)',\s*name:\s*'(?<name>[^']+)'\s*\}/gu
const README_DETAIL: Record<string, string> = {
  add: 'scaffold a table (auto-dispatches by DB in `.noboilrc.json`)',
  completions: 'print shell completion script',
  doctor: 'health check; `doctor --fix` auto-remediates',
  eject: 'inline the noboil library into `lib/noboil`',
  init: 'create a new project',
  status: 'project snapshot (drift, sync age, health)',
  sync: 'pull upstream changes (cached at `~/.noboil/upstream.git`)',
  upgrade: '`bun add noboil@latest`'
}
const main = () => {
  const src = readFileSync(`${REPO}/lib/noboil/src/dashboard-tui.tsx`, 'utf8')
  const rows: string[] = []
  let m = ROW_RE.exec(src)
  while (m) {
    if (m.groups) {
      const action = String(m.groups.action)
      const desc = String(m.groups.desc)
      const key = String(m.groups.key)
      const name = String(m.groups.name)
      const detail = README_DETAIL[action] ?? desc
      rows.push(`| \`${key}\` | \`${name}\` | ${detail} |`)
    }
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
