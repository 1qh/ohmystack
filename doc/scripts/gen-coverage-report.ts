#!/usr/bin/env bun
/* eslint-disable no-console */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const REPO = resolve(import.meta.dir, '../..')
const SCRIPTS_DIR = `${REPO}/doc/scripts`
const OUT = `${REPO}/doc/content/docs/single-source-of-truth.mdx`
const LINE_TAG_RE = /<!-- AUTO-GENERATED:(?<name>[A-Z0-9_-]+) -->/gu
const BLOCK_TAG_RE = /\{\/\* AUTO-GENERATED:(?<name>[A-Z0-9_-]+):START \*\/\}/gu
const findMarkers = (path: string): string[] => {
  const src = readFileSync(path, 'utf8')
  const out = new Set<string>()
  let m = LINE_TAG_RE.exec(src)
  while (m) {
    if (m.groups?.name) out.add(m.groups.name)
    m = LINE_TAG_RE.exec(src)
  }
  let bm = BLOCK_TAG_RE.exec(src)
  while (bm) {
    if (bm.groups?.name) out.add(bm.groups.name)
    bm = BLOCK_TAG_RE.exec(src)
  }
  return [...out]
}
const descriptions: Record<string, string> = {
  'gen-api-imports.ts': 'lib/noboil/src/**/index.ts → API export tables',
  'gen-brand-registry.ts': 'SchemaHintMap interface → brand registry table',
  'gen-cli-help.ts': '`noboil --help` output → CLI help blocks',
  'gen-cli-types.ts': '`TableType` union in convex/add.ts → CLI --type valid values',
  'gen-cvx-factory-api.ts': 'cvx server/{log,kv,quota}.ts `b.q()`/`b.m()` → endpoint table',
  'gen-demo-inventory.ts': 'web/{cvx,stdb}/* filesystem → demo count + tree',
  'gen-error-codes.ts': '`err()` / `throwConvexError()` calls across server → error code list',
  'gen-factory-api.ts': 'stdb server/{log,kv,quota}.ts reducer name templates → reducer table',
  'gen-factory-options.ts': 'LogOptions/KvOptions interfaces → option tables',
  'gen-hook-reference.ts': 'Log/Kv/QuotaHookResult interfaces → hook signature blocks',
  'gen-test-counts.ts': 'bun test pass count parsing → test count summary'
}
const describeScript = (s: string): string => descriptions[s] ?? '(undocumented)'
const targets = [
  `${REPO}/README.md`,
  `${REPO}/TODO.md`,
  `${REPO}/doc/content/docs/architecture.mdx`,
  `${REPO}/doc/content/docs/api-reference.mdx`,
  `${REPO}/doc/content/docs/cli.mdx`
]
const main = () => {
  const scripts = readdirSync(SCRIPTS_DIR)
    .filter(f => f.startsWith('gen-') && f.endsWith('.ts') && f !== 'gen-all.ts' && f !== 'gen-coverage-report.ts')
    .toSorted()
  const allMarkers: { file: string; markers: string[] }[] = []
  for (const t of targets) {
    const markers = findMarkers(t)
    if (markers.length > 0) allMarkers.push({ file: t.replace(`${REPO}/`, ''), markers })
  }
  const totalMarkers = allMarkers.reduce((s, m) => s + m.markers.length, 0)
  const lines = [
    '---',
    'title: Single source of truth',
    'description: How noboil docs stay in sync with the code that produces them.',
    '---',
    '',
    `noboil ships **${scripts.length} generators** that own **${totalMarkers} marker blocks** across ${allMarkers.length} doc files. Every block is rebuilt from source on \`bun docs\` and CI fails on drift via \`bun docs:check\`.`,
    '',
    '## Generators',
    '',
    '| Script | What it derives |',
    '|---|---|',
    ...scripts.map(s => {
      const desc = describeScript(s).replaceAll('{', String.raw`\{`).replaceAll('}', String.raw`\}`)
      return `| \`doc/scripts/${s}\` | ${desc} |`
    }),
    '',
    '## Marker blocks per doc',
    '',
    '| File | Auto-generated sections |',
    '|---|---|',
    ...allMarkers.map(m => `| \`${m.file}\` | ${m.markers.map(x => `\`${x}\``).join(', ')} |`),
    '',
    '## Workflow',
    '',
    '```sh',
    'bun docs            # regenerate all blocks',
    'bun docs:check      # exit 1 if any block is stale (CI uses this)',
    '```',
    '',
    "## What's NOT auto-generated (and won't be)",
    '',
    'Narrative prose: recipes, "when to use" decision matrices, security reasoning, architectural rationale, migration guides. These require human judgment and explanation. Everything machine-derivable is auto-generated.',
    ''
  ]
  writeFileSync(OUT, lines.join('\n'))
  console.log(`Wrote ${OUT.replace(`${REPO}/`, '')} (${scripts.length} generators, ${totalMarkers} markers)`)
}
main()
