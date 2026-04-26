#!/usr/bin/env bun
/* eslint-disable no-console, prefer-named-capture-group */
/** biome-ignore-all lint/nursery/noContinue: simple parser */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-line scan */
/** biome-ignore-all lint/nursery/useNamedCaptureGroup: positional matches sufficient */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
const REPO = resolve(import.meta.dir, '../..')
const DOCS_DIR = `${REPO}/doc/content/docs`
const SLUG_RE = /\]\(\.\/([a-z][a-z0-9-]*)(?:#([a-z][a-z0-9-]*))?\)/gu
const GITHUB_RE = /github\.com\/1qh\/noboil\/(?:blob|tree)\/main\/([^\s)]+)/gu
const slugify = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/^#+\s+/u, '')
    .replaceAll(/[^a-z0-9 -]/gu, '')
    .replaceAll(/\s+/gu, '-')
const main = () => {
  const files = readdirSync(DOCS_DIR).filter(f => f.endsWith('.mdx'))
  const slugs = new Set(files.map(f => f.replace(/\.mdx$/u, '')))
  const anchorsByFile = new Map<string, Set<string>>()
  for (const f of files) {
    const src = readFileSync(join(DOCS_DIR, f), 'utf8')
    const anchors = new Set<string>()
    for (const line of src.split('\n')) if (line.startsWith('#')) anchors.add(slugify(line))
    anchorsByFile.set(f.replace(/\.mdx$/u, ''), anchors)
  }
  const failures: string[] = []
  for (const f of files) {
    const src = readFileSync(join(DOCS_DIR, f), 'utf8')
    let m = SLUG_RE.exec(src)
    while (m) {
      const [, slug, anchor] = m
      if (slug && !slugs.has(slug)) failures.push(`${f}: dead link → ./${slug}`)
      else if (slug && anchor) {
        const targetAnchors = anchorsByFile.get(slug)
        if (targetAnchors && !targetAnchors.has(anchor)) failures.push(`${f}: dead anchor → ./${slug}#${anchor}`)
      }
      m = SLUG_RE.exec(src)
    }
    let gm = GITHUB_RE.exec(src)
    while (gm) {
      const path = gm[1]
      if (path) {
        const localPath = join(REPO, path)
        if (!existsSync(localPath)) failures.push(`${f}: dead github link → main/${path}`)
      }
      gm = GITHUB_RE.exec(src)
    }
  }
  const meta = JSON.parse(readFileSync(`${DOCS_DIR}/meta.json`, 'utf8')) as { pages: string[] }
  const navSet = new Set(meta.pages)
  const orphans = [...slugs].filter(s => !navSet.has(s))
  if (orphans.length > 0) failures.push(`Pages not in meta.json nav: ${orphans.join(', ')}`)
  if (failures.length > 0) {
    console.log(`✗ ${failures.length} link/nav issue(s):`)
    for (const fail of failures) console.log(`  ${fail}`)
    process.exit(1)
  }
  console.log(
    `Link check passed (${files.length} files, ${slugs.size} slugs, ${[...anchorsByFile.values()].reduce((s, a) => s + a.size, 0)} anchors)`
  )
}
main()
