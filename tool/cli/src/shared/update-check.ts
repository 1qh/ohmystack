import { file, write } from 'bun'
import { homedir } from 'node:os'
import { join } from 'node:path'
interface Cache {
  checkedAt: number
  version: string
}
const CACHE_PATH = () => join(homedir(), '.noboil', 'update-check.json')
const TTL_MS = 24 * 60 * 60 * 1000
const readCache = async (): Promise<Cache | null> => {
  try {
    const f = file(CACHE_PATH())
    if (await f.exists()) return (await f.json()) as Cache
  } catch {
    return null
  }
  return null
}
const writeCache = async (version: string): Promise<void> => {
  await write(CACHE_PATH(), `${JSON.stringify({ checkedAt: Date.now(), version })}\n`).catch(() => null)
}
const fetchLatest = async (): Promise<null | string> => {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2000)
    const res = await fetch('https://registry.npmjs.org/noboil/latest', { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string }
    return data.version ?? null
  } catch {
    return null
  }
}
const checkForUpdate = async (currentVersion: string): Promise<null | string> => {
  const cached = await readCache()
  if (cached && Date.now() - cached.checkedAt < TTL_MS) return cached.version
  const latest = await fetchLatest()
  if (latest) await writeCache(latest)
  return latest ?? currentVersion
}
export { checkForUpdate }
