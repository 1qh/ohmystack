#!/usr/bin/env bun
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential CLI spawns */
/** biome-ignore-all lint/suspicious/noControlCharactersInRegex: ANSI escape stripping */
/* oxlint-disable eslint(no-await-in-loop), eslint(no-control-regex), eslint-plugin-unicorn(no-hex-escape), eslint-plugin-unicorn(no-immediate-mutation) */
/* eslint-disable no-console, no-await-in-loop, no-control-regex */
import { $ } from 'bun'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const REPO = resolve(import.meta.dir, '../..')
const BIN = `${REPO}/lib/noboil/src/index.ts`
const CONVEX_BIN = `${REPO}/lib/noboil/src/convex/cli.ts`
const STDB_BIN = `${REPO}/lib/noboil/src/spacetimedb/cli.ts`
const mdxPath = resolve(import.meta.dir, '../content/docs/cli.mdx')
const START = '{/* AUTO-GENERATED:HELP:START */}'
const END = '{/* AUTO-GENERATED:HELP:END */}'
const STRIP_ANSI = /\x1B\[[\d;]*m/gu
const runHelp = async (bin: string, args: string[]): Promise<string> => {
  const proc = await $`bun ${bin} ${args} --help`.quiet().nothrow()
  return proc.stdout.toString().replaceAll(STRIP_ANSI, '').trim()
}
const codeBlock = (title: string, body: string): string => `**${title}**\n\n\`\`\`text\n${body}\n\`\`\``
const main = async () => {
  const blocks: string[] = []
  blocks.push(codeBlock('noboil --help', await runHelp(BIN, [])))
  for (const cmd of ['init', 'doctor', 'status', 'sync', 'eject', 'upgrade'])
    blocks.push(codeBlock(`noboil ${cmd} --help`, await runHelp(BIN, [cmd])))
  blocks.push(codeBlock('noboil-convex --help', await runHelp(CONVEX_BIN, [])))
  blocks.push(codeBlock('noboil-convex add --help', await runHelp(CONVEX_BIN, ['add'])))
  blocks.push(codeBlock('noboil-stdb --help', await runHelp(STDB_BIN, [])))
  blocks.push(codeBlock('noboil-stdb add --help', await runHelp(STDB_BIN, ['add'])))
  const section = `\n${blocks.join('\n\n')}\n`
  const mdx = readFileSync(mdxPath, 'utf8')
  const startIdx = mdx.indexOf(START)
  const endIdx = mdx.indexOf(END)
  if (startIdx === -1 || endIdx === -1) {
    console.error(`Missing markers in ${mdxPath}. Add:\n${START}\n${END}`)
    process.exit(1)
  }
  const updated = mdx.slice(0, startIdx + START.length) + section + mdx.slice(endIdx)
  if (updated === mdx) console.log('cli.mdx help section already up to date')
  else if (process.argv.includes('--check')) console.log('Updated cli.mdx help section (drift)')
  else {
    writeFileSync(mdxPath, updated)
    console.log('Updated cli.mdx help section')
  }
}
await main()
