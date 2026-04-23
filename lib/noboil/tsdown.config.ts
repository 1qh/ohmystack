import { writeFile } from 'node:fs/promises'
import { defineConfig } from 'tsdown'
import pkg from './package.json' with { type: 'json' }
const SRC_RE = /^\.\/src\//u
const TS_EXT_RE = /\.tsx?$/u
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
const srcToMjs = (p: string) => p.replace(SRC_RE, './').replace(TS_EXT_RE, '.mjs')
const srcToDts = (p: string) => p.replace(SRC_RE, './').replace(TS_EXT_RE, '.d.mts')
const wrap = (p: string) => ({ default: srcToMjs(p), types: srcToDts(p) })
const writePublishPkgJson = async () => {
  const published = structuredClone(pkg) as Record<string, unknown>
  const exportsMap = published.exports as Record<string, Record<string, string> | string>
  for (const [sub, target] of Object.entries(exportsMap))
    if (sub === './package.json') Reflect.deleteProperty(exportsMap, sub)
    else if (typeof target === 'string') exportsMap[sub] = wrap(target)
    else {
      const next: Record<string, unknown> = {}
      for (const [cond, path] of Object.entries(target)) next[cond] = wrap(path)
      exportsMap[sub] = next as Record<string, string>
    }
  published.bin = Object.fromEntries(
    Object.entries(published.bin as Record<string, string>).map(([name, src]) => [name, srcToMjs(src)])
  )
  Reflect.deleteProperty(published, 'files')
  Reflect.deleteProperty(published, 'devDependencies')
  Reflect.deleteProperty(published, 'scripts')
  await writeFile('dist/package.json', `${JSON.stringify(published, null, 2)}\n`)
}
export default defineConfig({
  clean: true,
  copy: [
    { from: 'README.md', to: 'dist/README.md' },
    { from: 'LICENSE', to: 'dist/LICENSE' }
  ],
  dts: { eager: true },
  entry: [...entries],
  format: 'esm',
  noExternal: [/^@a\/ui/u],
  onSuccess: writePublishPkgJson,
  outDir: 'dist',
  sourcemap: true
})
