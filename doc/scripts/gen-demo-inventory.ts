#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/nursery/noContinue: simple scanner */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { replaceLineBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const dbDescription: Record<string, string> = {
  cvx: 'Convex',
  stdb: 'SpacetimeDB'
}
const collect = (kind: 'cvx' | 'stdb'): string[] => {
  const root = join(REPO, 'web', kind)
  const entries: string[] = []
  for (const name of readdirSync(root)) {
    const dir = join(root, name)
    if (!statSync(dir).isDirectory()) continue
    if (!readFileSync(join(dir, 'package.json'), 'utf8').includes('"name"')) continue
    entries.push(name)
  }
  return entries.toSorted()
}
const main = () => {
  const cvx = collect('cvx')
  const stdb = collect('stdb')
  const both = [...new Set([...cvx, ...stdb])].toSorted()
  const list = both.join(', ')
  const tagline = `${both.length} vertical demos (${list})`
  const tree = `    cvx/              ${cvx.length} ${dbDescription.cvx} demo web apps (${cvx.join(', ')})\n    stdb/             ${stdb.length} ${dbDescription.stdb} demo web apps (${stdb.join(', ')})`
  const readme = join(REPO, 'README.md')
  let dirty = false
  if (replaceLineBetween(readme, 'DEMO-COUNT', tagline)) dirty = true
  if (replaceLineBetween(readme, 'DEMO-TREE', tree)) dirty = true
  console.log(dirty ? `Updated demo inventory: ${tagline}` : 'Demo inventory already up to date')
}
main()
