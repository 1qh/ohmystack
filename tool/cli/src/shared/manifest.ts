import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
interface Manifest {
  db?: 'convex' | 'spacetimedb'
  ejected?: boolean
  includeDemos?: boolean
  scaffoldedAt?: string
  scaffoldedFrom?: string
  version?: number
}
const findManifestPath = (start: string): null | string => {
  let dir = start
  for (let i = 0; i < 10; i += 1) {
    const p = join(dir, '.noboilrc.json')
    if (existsSync(p)) return p
    const parent = join(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}
const readManifestFrom = (start: string): null | { manifest: Manifest; path: string } => {
  const path = findManifestPath(start)
  if (!path) return null
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest
    return { manifest, path }
  } catch {
    return null
  }
}
export type { Manifest }
export { findManifestPath, readManifestFrom }
