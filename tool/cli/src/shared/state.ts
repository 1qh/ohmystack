import { file, write } from 'bun'
import { homedir } from 'node:os'
import { join } from 'node:path'
interface NoboilState {
  lastAppDir?: string
  lastConvexDir?: string
  lastDb?: 'convex' | 'spacetimedb'
  lastFieldType?: string
  lastModuleDir?: string
  lastTableName?: string
  lastTableType?: string
}
const statePath = () => join(homedir(), '.noboil', 'state.json')
const readState = async (): Promise<NoboilState> => {
  try {
    const f = file(statePath())
    if (await f.exists()) return (await f.json()) as NoboilState
  } catch {
    return {}
  }
  return {}
}
const writeState = async (next: NoboilState): Promise<void> => {
  const prev = await readState()
  await write(statePath(), `${JSON.stringify({ ...prev, ...next }, null, 2)}\n`).catch(() => null)
}
export type { NoboilState }
export { readState, writeState }
