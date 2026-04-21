/* oxlint-disable no-process-exit */
import { config, urls } from '@a/config'
import { emit } from './emit-env'
import { box, c, log, ok, parseArgs, patchEnv, run, step, waitHealthy, warn } from './utils'
const flags = parseArgs(process.argv.slice(2))
const pull = flags.has('pull')
const skipPublish = flags.has('no-publish')
const u = urls()
log(c.bold('\nSpacetimeDB setup\n'))
emit()
await run('bun script/doctor.ts --stdb', { quiet: false })
const TOTAL = 3
step(1, TOTAL, 'Writing .env defaults')
patchEnv([
  ['NEXT_PUBLIC_SPACETIMEDB_URI', u.stdbWs],
  ['SPACETIMEDB_MODULE_NAME', config.module],
  ['SPACETIMEDB_URI', u.stdbWs]
])
step(2, TOTAL, pull ? 'Pulling image + starting SpacetimeDB' : 'Starting SpacetimeDB (docker compose up)')
if (pull) await run('docker compose -f spacetimedb.yml pull', { quiet: false })
await run('docker compose -f spacetimedb.yml up -d --quiet-pull')
const ready = await waitHealthy(`http://localhost:${config.ports.stdb}/v1/ping`, 60_000)
if (!ready) {
  warn('SpacetimeDB not healthy in 60s. Logs:')
  await run('docker compose -f spacetimedb.yml logs --tail 40', { quiet: false })
  process.exit(1)
}
ok('SpacetimeDB healthy')
await run(
  `bash -lc 'PATH="$HOME/.local/bin:$PATH" spacetime server remove local 2>/dev/null || true; spacetime server add local --url http://localhost:${config.ports.stdb} --no-fingerprint --default'`
)
ok('Registered spacetime server `local`')
if (skipPublish) {
  box('SpacetimeDB ready (publish skipped)', [`${c.bold('URL')} ${u.stdbWs}`])
  process.exit(0)
}
step(3, TOTAL, 'Publishing module')
await run('bun script/stdb-publish.ts --delete-data -y', { quiet: false })
box('SpacetimeDB ready', [
  `${c.bold('URL')}    ${u.stdbWs}`,
  `${c.bold('Module')} ${config.module}`,
  '',
  c.dim('Next: bun dev:all')
])
