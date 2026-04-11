import { $ } from 'bun'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const root = join(import.meta.dirname, '..')
const envPath = join(root, '.env')
const log = (msg: string) => process.stdout.write(`${msg}\n`)
const run = async (cmd: string) => {
  log(`> ${cmd}`)
  const result = await $`bash -c ${cmd}`.cwd(root).quiet()
  if (result.exitCode !== 0) {
    process.stderr.write(result.stderr.toString())
    throw new Error(`Command failed: ${cmd}`)
  }
  return result.stdout.toString().trim()
}
const patchEnv = (entries: [string, string][]) => {
  const current: Record<string, string> = {}
  if (existsSync(envPath))
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) current[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
      }
    }
  for (const [k, v] of entries) current[k] = v
  writeFileSync(
    envPath,
    `${Object.entries(current)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')}\n`
  )
}
log('=== SpacetimeDB setup ===\n')
log('[1/3] Writing .env...')
patchEnv([
  ['NEXT_PUBLIC_SPACETIMEDB_URI', 'ws://localhost:4000'],
  ['SPACETIMEDB_MODULE_NAME', 'noboil'],
  ['SPACETIMEDB_URI', 'ws://localhost:4000'],
  ['SITE_URL', 'http://localhost:4200']
])
log('[2/3] Starting SpacetimeDB...')
await run('bun spacetime:up')
log('[3/3] Publishing module...')
await run(
  'bash -lc \'PATH="$HOME/.local/bin:$PATH" spacetime server remove local 2>/dev/null; spacetime server add local --url http://localhost:4000 --no-fingerprint --default && spacetime publish noboil --module-path backend/spacetimedb --delete-data -y\''
)
log('\n=== SpacetimeDB ready ===')
