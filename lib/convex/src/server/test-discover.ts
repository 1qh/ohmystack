import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Scans a Convex directory for all `.ts` files (excluding tests) and returns a module map for `convex-test`. */
const discoverModules = (
  convexDir: string,
  extras?: Record<string, () => Promise<unknown>>
): Record<string, () => Promise<unknown>> => {
  const modules: Record<string, () => Promise<unknown>> = {},
    absConvex = join(process.cwd(), convexDir),
    parentDir = dirname(absConvex),
    scanDir = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true }))
        if (entry.isDirectory() && !entry.name.startsWith('_') && entry.name !== 'node_modules')
          scanDir(join(dir, entry.name), `${prefix}${entry.name}/`)
        else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
          const relKey = `./${prefix}${entry.name}`,
            absPath = join(dir, entry.name)
          modules[relKey] = async () => import(absPath)
        }
    }
  scanDir(absConvex, '')
  for (const entry of readdirSync(parentDir))
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.config.ts')) {
      const relKey = `../${entry}`,
        absPath = join(parentDir, entry)
      modules[relKey] = async () => import(absPath)
    }
  if (extras)
    for (const k of Object.keys(extras)) {
      const fn = extras[k]
      if (fn) modules[k] = fn
    }
  return modules
}

export { discoverModules }
