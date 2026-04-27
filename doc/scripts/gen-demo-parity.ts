#!/usr/bin/env bun
/* eslint-disable no-console, no-continue */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-file scan */
/** biome-ignore-all lint/nursery/noContinue: walker */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const DEMOS = ['blog', 'chat', 'movie', 'org', 'poll']
const TEST_RE = /\b(?:test|it)\(\s*['"`]/gu
const walk = (dir: string, out: string[] = []): string[] => {
  if (!statSync(dir, { throwIfNoEntry: false })) return out
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules' || name === '.next') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}
const collectRoutes = (root: string, base = ''): string[] => {
  if (!statSync(root, { throwIfNoEntry: false })) return []
  const out: string[] = []
  for (const name of readdirSync(root)) {
    if (name.startsWith('.') || name === 'node_modules' || name === 'api') continue
    const full = join(root, name)
    const s = statSync(full)
    if (s.isDirectory()) out.push(...collectRoutes(full, `${base}/${name}`))
    else if (name === 'page.tsx') out.push(base || '/')
  }
  return out.toSorted()
}
const countTests = (dir: string): number => {
  let n = 0
  if (!statSync(dir, { throwIfNoEntry: false })) return 0
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.test.ts')) continue
    const src = readFileSync(`${dir}/${f}`, 'utf8')
    let m = TEST_RE.exec(src)
    while (m) {
      n += 1
      m = TEST_RE.exec(src)
    }
    TEST_RE.lastIndex = 0
  }
  return n
}
const countSrcLines = (root: string): number => {
  if (!statSync(root, { throwIfNoEntry: false })) return 0
  let total = 0
  for (const f of walk(root)) {
    if (!(f.endsWith('.ts') || f.endsWith('.tsx'))) continue
    if (f.endsWith('.test.ts')) continue
    total += readFileSync(f, 'utf8').split('\n').length
  }
  return total
}
const KNOWN_BACKEND_ONLY = {
  cvx: new Set<string>(),
  stdb: new Set(['/dev'])
}
const SRC_LOC_EXEMPT: Record<string, string> = {
  movie:
    'stdb-movie does TMDB fetching client-side (no server-side action available); cvx delegates to action — architectural difference, see base.fetcher in option-parity above'
}
const main = () => {
  const rows: string[] = []
  let perfectCount = 0
  for (const demo of DEMOS) {
    const cvxRoot = `${REPO}/web/cvx/${demo}`
    const stdbRoot = `${REPO}/web/stdb/${demo}`
    const cvxRoutes = collectRoutes(`${cvxRoot}/src/app`)
    const stdbRoutes = collectRoutes(`${stdbRoot}/src/app`)
    const cvxOnly = cvxRoutes.filter(r => !(stdbRoutes.includes(r) || KNOWN_BACKEND_ONLY.cvx.has(r)))
    const stdbOnly = stdbRoutes.filter(r => !(cvxRoutes.includes(r) || KNOWN_BACKEND_ONLY.stdb.has(r)))
    const cvxTests = countTests(`${cvxRoot}/e2e`)
    const stdbTests = countTests(`${stdbRoot}/e2e`)
    const cvxSrc = countSrcLines(`${cvxRoot}/src`)
    const stdbSrc = countSrcLines(`${stdbRoot}/src`)
    const routesOk = cvxOnly.length === 0 && stdbOnly.length === 0
    const testsOk = cvxTests === stdbTests
    const srcDiffPct = Math.abs(cvxSrc - stdbSrc) / Math.max(cvxSrc, stdbSrc)
    const srcExempt = Boolean(SRC_LOC_EXEMPT[demo])
    const srcOk = srcDiffPct < 0.4 || srcExempt
    const allOk = routesOk && testsOk && srcOk
    if (allOk) perfectCount += 1
    const status = allOk ? '🟢' : '🟡'
    const routesCol = routesOk
      ? `${cvxRoutes.length}/${stdbRoutes.length} ✓`
      : `${cvxRoutes.length}/${stdbRoutes.length} (cvx-only: ${cvxOnly.join(', ') || '—'}, stdb-only: ${stdbOnly.join(', ') || '—'})`
    rows.push(
      `| \`${demo}\` | ${routesCol} | ${cvxTests} / ${stdbTests} ${testsOk ? '✓' : '⚠'} | ${cvxSrc} / ${stdbSrc} ${srcOk ? '✓' : '⚠'} | ${status} |`
    )
  }
  const intentional: string[] = []
  for (const r of KNOWN_BACKEND_ONLY.stdb)
    intentional.push(`- **\`stdb${r}\`** — SpacetimeDB SchemaPlayground dev tool (cvx has no equivalent component)`)
  for (const [demo, reason] of Object.entries(SRC_LOC_EXEMPT))
    intentional.push(`- **\`${demo}\` src LOC asymmetry** — ${reason}`)
  const body = [
    'Per-demo parity audit. Each of the 5 demos compared across both backends: route count, e2e test count, source LOC.',
    '',
    `**${perfectCount}/${DEMOS.length} demos at full parity.** Backend-specific routes (intentional asymmetries) listed below.`,
    '',
    '| Demo | Routes (cvx/stdb) | E2E tests (cvx/stdb) | Source LOC (cvx/stdb) | Status |',
    '|---|---|---|---|--|',
    ...rows,
    '',
    intentional.length > 0 ? '### Backend-specific routes (intentional)\n' : '',
    ...intentional
  ]
    .filter(Boolean)
    .join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'DEMO-PARITY', body)
  if (dirty) console.log(`Updated demo parity (${perfectCount}/${DEMOS.length} full)`)
}
main()
