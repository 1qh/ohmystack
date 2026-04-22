import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { defineConfig } from 'tsdown'
import pkg from './package.json' with { type: 'json' }
const DYNAMIC_IMPORT_RE = /await import\(['"]\.\/(?<sub>[^'"]+)['"]\)/gu
const collect = (target: unknown, into: Set<string>): void => {
  if (typeof target === 'string') {
    if (target.startsWith('./src/')) into.add(target.slice(2))
    return
  }
  if (target && typeof target === 'object') for (const v of Object.values(target)) collect(v, into)
}
const entries = new Set<string>()
collect(pkg.exports, entries)
for (const bin of Object.values(pkg.bin)) collect(bin, entries)
for (const binPath of Object.values(pkg.bin)) {
  const rel = binPath.replace(/^\.\//u, '')
  const src = readFileSync(rel, 'utf8')
  const base = dirname(rel)
  for (const [, sub] of src.matchAll(DYNAMIC_IMPORT_RE)) entries.add(`${base}/${sub}.ts`)
}
export default defineConfig({
  clean: true,
  dts: { eager: true },
  entry: [...entries],
  format: 'esm',
  outDir: 'dist',
  sourcemap: true
})
