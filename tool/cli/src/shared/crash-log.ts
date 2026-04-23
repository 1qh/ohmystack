/** biome-ignore-all lint/suspicious/noEmptyBlockStatements: best-effort logger, swallow IO errors */
/* oxlint-disable no-empty */
/* eslint-disable no-empty */
import { write } from 'bun'
import { homedir } from 'node:os'
import { join } from 'node:path'
const LOG_PATH = () => join(homedir(), '.noboil', 'last-error.log')
const logCrash = async (error: unknown): Promise<void> => {
  const stack = error instanceof Error ? (error.stack ?? error.message) : String(error)
  const entry = `[${new Date().toISOString()}]\nargv: ${process.argv.slice(2).join(' ')}\ncwd: ${process.cwd()}\n\n${stack}\n`
  try {
    await write(LOG_PATH(), entry)
  } catch {}
}
export { LOG_PATH, logCrash }
