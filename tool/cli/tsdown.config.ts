import { readFileSync } from 'node:fs'
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
  const src = readFileSync(binPath.replace(/^\.\//u, ''), 'utf8')
  for (const [, sub] of src.matchAll(DYNAMIC_IMPORT_RE)) entries.add(`src/${sub}.ts`)
}
export default defineConfig({
  clean: true,
  dts: { eager: true },
  entry: [...entries],
  format: 'esm',
  outDir: 'dist',
  sourcemap: true
})
