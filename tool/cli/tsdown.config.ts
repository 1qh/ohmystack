import { existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { defineConfig } from 'tsdown'
import pkg from './package.json' with { type: 'json' }
const DYNAMIC_IMPORT_RE = /await import\(['"]\.\/(?<sub>[^'"]+)['"]\)/gu
const BIN_PREFIX_RE = /^\.\//u
const collect = (target: unknown, into: Set<string>): void => {
  if (typeof target === 'string') {
    if (target.startsWith('./src/')) into.add(target.slice(2))
    return
  }
  if (target && typeof target === 'object') for (const v of Object.values(target)) collect(v, into)
}
const resolveEntry = (baseRel: string): string => {
  if (existsSync(`${baseRel}.ts`)) return `${baseRel}.ts`
  if (existsSync(`${baseRel}.tsx`)) return `${baseRel}.tsx`
  return `${baseRel}.ts`
}
const scanBinDynamics = (binPath: string, into: Set<string>): void => {
  const rel = binPath.replace(BIN_PREFIX_RE, '')
  const src = readFileSync(rel, 'utf8')
  const base = dirname(rel)
  for (const [, sub] of src.matchAll(DYNAMIC_IMPORT_RE)) into.add(resolveEntry(`${base}/${sub}`))
}
const entries = new Set<string>()
collect(pkg.exports, entries)
for (const bin of Object.values(pkg.bin)) collect(bin, entries)
for (const binPath of Object.values(pkg.bin)) scanBinDynamics(binPath, entries)
export default defineConfig({
  clean: true,
  dts: { eager: true },
  entry: [...entries],
  format: 'esm',
  outDir: 'dist',
  sourcemap: true
})
