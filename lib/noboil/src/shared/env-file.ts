/* eslint-disable no-continue */
/** biome-ignore-all lint/nursery/noContinue: line skip on comments/empty */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
const parseEnvFile = (path: string): Record<string, string> => {
  const vars: Record<string, string> = {}
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return vars
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1).trim()
    vars[key] = value
  }
  return vars
}
const hasMarkers = (dir: string, markers: readonly string[]): boolean => markers.every(m => existsSync(join(dir, m)))
const findProjectRoot = (start = process.cwd(), markers: readonly string[] = ['package.json']): string => {
  let dir = start
  for (let i = 0; i < 30; i += 1) {
    if (hasMarkers(dir, markers)) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return start
}
export { findProjectRoot, parseEnvFile }
