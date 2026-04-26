#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/nursery/noContinue: simple parser */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-line scan */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const RECIPES = `${REPO}/doc/content/docs/recipes.mdx`
const slugify = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/^#+\s+/u, '')
    .replaceAll(/[^a-z0-9 -]/gu, '')
    .replaceAll(/\s+/gu, '-')
const main = () => {
  const src = readFileSync(RECIPES, 'utf8')
  const headings: { slug: string; text: string }[] = []
  for (const line of src.split('\n')) {
    if (!line.startsWith('## ')) continue
    if (line.includes('AUTO-GENERATED')) continue
    const text = line.slice(3).trim()
    headings.push({ slug: slugify(line), text })
  }
  const lines = ['## Recipes index', '', `${headings.length} recipes (auto-generated TOC):`, '']
  for (const h of headings) lines.push(`- [${h.text}](#${h.slug})`)
  const body = lines.join('\n')
  const dirty = replaceBetween(RECIPES, 'RECIPE-TOC', body)
  console.log(
    dirty ? `Updated recipe TOC (${headings.length} recipes)` : `Recipe TOC up to date (${headings.length} recipes)`
  )
}
main()
