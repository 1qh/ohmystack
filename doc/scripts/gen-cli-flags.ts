#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-block */
/** biome-ignore-all lint/nursery/noContinue: parser */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const escapeMd = (s: string): string =>
  s
    .replaceAll('|', String.raw`\|`)
    .replaceAll('{', String.raw`\{`)
    .replaceAll('}', String.raw`\}`)
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
const FLAG_RE = /^\s{2,}(?<flag>(?:--[\w-]+|-\w)(?:[=,\s][^\s][^\s]*)*)\s{2,}(?<desc>\S.*)$/u
const COMMAND_RE =
  /\*\*(?<cmd>(?:noboil|noboil-convex|noboil-stdb)(?: \w+)?(?: --help)?)\*\*\n+```text\n(?<body>[\s\S]*?)\n```/gu
interface Flag {
  description: string
  flag: string
}
const parseHelpBlock = (text: string): Flag[] => {
  const flags: Flag[] = []
  let inOpts = false
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (/^\s*Options:\s*$/u.test(line)) {
      inOpts = true
      continue
    }
    if (/^[A-Z]/u.test(line.trim()) && line.trim().endsWith(':')) inOpts = line.trim() === 'Options:'
    if (!inOpts) continue
    const m = FLAG_RE.exec(line)
    if (m?.groups?.desc && m.groups.flag) flags.push({ description: m.groups.desc.trim(), flag: m.groups.flag.trim() })
  }
  return flags
}
const main = () => {
  const src = readFileSync(`${REPO}/doc/content/docs/cli.mdx`, 'utf8')
  const sections: string[] = []
  let total = 0
  let m = COMMAND_RE.exec(src)
  while (m) {
    if (m.groups?.body && m.groups.cmd) {
      const flags = parseHelpBlock(m.groups.body)
      if (flags.length > 0) {
        total += flags.length
        sections.push(`**\`${m.groups.cmd.replace(' --help', '')}\`** — ${flags.length} option(s)`)
        sections.push('')
        sections.push('| Flag | Description |')
        sections.push('|---|---|')
        for (const f of flags) sections.push(`| \`${escapeMd(f.flag)}\` | ${escapeMd(f.description)} |`)
        sections.push('')
      }
    }
    m = COMMAND_RE.exec(src)
  }
  COMMAND_RE.lastIndex = 0
  const body = [`Parsed flag tables for every \`--help\` block above. **${total} flags total.**`, '', ...sections].join(
    '\n'
  )
  const dirty = replaceBetween(`${REPO}/doc/content/docs/cli.mdx`, 'CLI-FLAGS', body)
  console.log(dirty ? `Updated CLI flag tables (${total} flags)` : `CLI flag tables up to date (${total} flags)`)
}
main()
