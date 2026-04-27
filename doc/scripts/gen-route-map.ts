#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/performance/useTopLevelRegex: walker */
/** biome-ignore-all lint/nursery/noContinue: walker */
import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const DEMOS = ['blog', 'chat', 'movie', 'org', 'poll']
const walkRoutes = (root: string, base = ''): string[] => {
  if (!statSync(root, { throwIfNoEntry: false })) return []
  const out: string[] = []
  for (const name of readdirSync(root)) {
    if (name.startsWith('.') || name === 'node_modules' || name === 'api') continue
    const full = join(root, name)
    const s = statSync(full)
    if (s.isDirectory()) out.push(...walkRoutes(full, `${base}/${name}`))
    else if (name === 'page.tsx') out.push(base || '/')
  }
  return out.toSorted()
}
const main = () => {
  const sections: string[] = []
  let totalRoutes = 0
  for (const db of ['cvx', 'stdb']) {
    sections.push(`### ${db === 'cvx' ? 'Convex' : 'SpacetimeDB'}`)
    sections.push('')
    sections.push('| Demo | Routes |')
    sections.push('|---|---|')
    for (const demo of DEMOS) {
      const root = `${REPO}/web/${db}/${demo}/src/app`
      const routes = walkRoutes(root)
      totalRoutes += routes.length
      const list = routes.length === 0 ? '_(none found)_' : routes.map(r => `\`${r}\``).join(', ')
      sections.push(`| \`${demo}\` | ${list} |`)
    }
    sections.push('')
  }
  const body = [`**${totalRoutes} Next.js \`page.tsx\` routes** across all demo apps.`, '', ...sections].join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'ROUTE-MAP', body)
  console.log(dirty ? `Updated route map (${totalRoutes} routes)` : 'Route map up to date')
}
main()
