import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
type Db = 'convex' | 'spacetimedb'
interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  name?: string
  private?: boolean
  scripts?: Record<string, string>
  workspaces?: string[]
}
const REMOVE_ALWAYS = [
  '.github',
  'AGENTS.md',
  'LEARNING.md',
  'PLAN.md',
  'RULES.md',
  'TODO.md',
  'doc',
  'script/prep-publish.ts'
]
const rmSafe = (path: string) => {
  if (existsSync(path)) rmSync(path, { force: true, recursive: true })
}
const removeDirs = ({ db, dir, includeDemos }: { db: Db; dir: string; includeDemos: boolean }): string[] => {
  const dbTag = db === 'convex' ? 'cvx' : 'stdb'
  const otherTag = db === 'convex' ? 'stdb' : 'cvx'
  const otherDb = db === 'convex' ? 'spacetimedb' : 'convex'
  const toRemove = [...REMOVE_ALWAYS, `web/${otherTag}`, `backend/${otherDb}`, 'backend/agent', 'tool/cli']
  if (!includeDemos) toRemove.push(`web/${dbTag}`)
  const removed: string[] = []
  for (const p of toRemove) {
    const full = join(dir, p)
    if (existsSync(full)) {
      rmSafe(full)
      removed.push(p)
    }
  }
  return removed
}
const stripAScope = (section?: Record<string, string>): Record<string, string> | undefined => {
  if (!section) return
  const next: Record<string, string> = {}
  for (const [key, val] of Object.entries(section)) if (!key.startsWith('@a/')) next[key] = val
  return next
}
const patchRootPackageJson = ({ db, dir, includeDemos }: { db: Db; dir: string; includeDemos: boolean }) => {
  const pkgPath = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson
  const otherDb = db === 'convex' ? 'spacetimedb' : 'convex'
  const shouldDrop = (key: string, val: string) =>
    key === 'test' ||
    (db === 'spacetimedb' && key.includes('codegen')) ||
    (db === 'convex' && key.startsWith('spacetime:')) ||
    (!includeDemos && (key.startsWith('dev:') || key.startsWith('test:e2e'))) ||
    val.includes(otherDb)
  pkg.name = 'my-app'
  pkg.private = true
  const workspaces: string[] = ['lib/*', 'backend/*', 'readonly/*']
  if (includeDemos) workspaces.push(db === 'convex' ? 'web/cvx/*' : 'web/stdb/*')
  pkg.workspaces = workspaces
  if (pkg.scripts) {
    const keep: Record<string, string> = { test: 'echo "add tests"' }
    for (const [key, val] of Object.entries(pkg.scripts)) if (!shouldDrop(key, val)) keep[key] = val
    pkg.scripts = keep
  }
  const deps = stripAScope(pkg.dependencies) ?? {}
  deps.noboil = 'latest'
  pkg.dependencies = deps
  pkg.devDependencies = stripAScope(pkg.devDependencies)
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
}
export type { Db, PackageJson }
export { patchRootPackageJson, REMOVE_ALWAYS, removeDirs, rmSafe }
