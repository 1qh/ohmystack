import { createRequire } from 'node:module'
const version = '0.0.1'
const EXPORT_PREFIX = /^\.\//u
type NoboilCondition = 'noboil-convex' | 'noboil-spacetimedb'
const readExports = (): Record<string, unknown> => {
  const req = createRequire(import.meta.url)
  const pkg = req('noboil/package.json') as { exports: Record<string, unknown> }
  return pkg.exports
}
const resolveAliasFor = (condition: NoboilCondition): Record<string, string> => {
  const exp = readExports()
  const db = condition === 'noboil-spacetimedb' ? 'spacetimedb' : 'convex'
  const aliases: Record<string, string> = {}
  for (const [key, target] of Object.entries(exp))
    if (target && typeof target === 'object' && condition in target) {
      const name = key.replace(EXPORT_PREFIX, '')
      if (name !== '.') aliases[`noboil/${name}`] = `noboil/${db}/${name}`
    }
  return aliases
}
export type { NoboilCondition }
export { resolveAliasFor, version }
