#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/nursery/noContinue: filter loop */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
const exportPat = /export\s+(?:type\s+)?\{(?<syms>[^}]+)\}/gu
const exportConstPat = /export\s+(?:const|function|class|default)\s+(?<name>\w+)/gu
const asPat = /(?<orig>\w+)\s+as\s+(?<alias>\w+)/u
const wsPat = /\s/u
const parseName = (trimmed: string): string | undefined => {
  const asMatch = asPat.exec(trimmed)
  if (asMatch) return asMatch.groups?.alias
  const name = trimmed.split(wsPat)[0] ?? ''
  return name && name !== 'type' ? name : undefined
}
const extractExports = (filePath: string): string[] => {
  const content = readFileSync(filePath, 'utf8')
  const names = new Set<string>()
  let m = exportPat.exec(content)
  while (m) {
    const block = m.groups?.syms ?? ''
    for (const part of block.split(',')) {
      const trimmed = part.trim()
      if (trimmed) {
        const name = parseName(trimmed)
        if (name) names.add(name)
      }
    }
    m = exportPat.exec(content)
  }
  exportPat.lastIndex = 0
  let cm = exportConstPat.exec(content)
  while (cm) {
    const n = cm.groups?.name
    if (n && n !== 'default') names.add(n)
    cm = exportConstPat.exec(content)
  }
  exportConstPat.lastIndex = 0
  names.delete('type')
  return [...names].toSorted()
}
const genTable = (pkgDir: string, filter: string): string => {
  const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
    exports: Record<string, string | { default?: string; types?: string }>
    name: string
  }
  const rows: string[] = []
  for (const [subpath, target] of Object.entries(pkgJson.exports)) {
    if (!subpath.startsWith(`./${filter}`)) continue
    const targetPath = typeof target === 'string' ? target : (target.types ?? target.default ?? '')
    if (targetPath) {
      const filePath = resolve(pkgDir, targetPath)
      const names = extractExports(filePath)
      if (names.length > 0) {
        const modulePath = `${pkgJson.name}/${subpath.replace('./', '')}`
        rows.push(`| \`${modulePath}\` | \`${names.join('`, `')}\` |`)
      }
    }
  }
  return rows.join('\n')
}
const START = '{/* AUTO-GENERATED:IMPORTS:START */}'
const END = '{/* AUTO-GENERATED:IMPORTS:END */}'
const convexDir = resolve(import.meta.dir, '../../lib/noboil')
const stdbDir = resolve(import.meta.dir, '../../lib/noboil')
const mdxPath = resolve(import.meta.dir, '../content/docs/api-reference.mdx')
const section = [
  '',
  "<Tabs groupId=\"db\" items={['Convex', 'SpacetimeDB']} persist>",
  '<Tab value="Convex">',
  '',
  '| Module | Key Exports |',
  '| ------ | ----------- |',
  genTable(convexDir, 'convex'),
  '',
  '</Tab>',
  '<Tab value="SpacetimeDB">',
  '',
  '| Module | Key Exports |',
  '| ------ | ----------- |',
  genTable(stdbDir, 'spacetimedb'),
  '',
  '</Tab>',
  '</Tabs>',
  ''
].join('\n')
const mdx = readFileSync(mdxPath, 'utf8')
const startIdx = mdx.indexOf(START)
const endIdx = mdx.indexOf(END)
if (startIdx === -1 || endIdx === -1) {
  console.error('Missing AUTO-GENERATED:IMPORTS markers in api-reference.mdx')
  process.exit(1)
}
const updated = mdx.slice(0, startIdx + START.length) + section + mdx.slice(endIdx)
if (updated === mdx) console.log('api-reference.mdx imports section already up to date')
else {
  writeFileSync(mdxPath, updated)
  console.log('Updated api-reference.mdx imports section')
}
