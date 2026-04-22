import { defineConfig } from 'tsdown'
import pkg from './package.json' with { type: 'json' }
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
entries.add('src/doctor.ts')
entries.add('src/eject.ts')
entries.add('src/init.ts')
entries.add('src/sync.ts')
export default defineConfig({
  clean: true,
  dts: { eager: true },
  entry: [...entries],
  format: 'esm',
  outDir: 'dist',
  sourcemap: true
})
