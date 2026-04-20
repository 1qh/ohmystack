/* oxlint-disable no-process-exit */
import { box, c, log, ok, parseArgs, patchEnvDefaults, run, step, waitHealthy, warn } from './utils'
const flags = parseArgs(process.argv.slice(2))
const pull = flags.has('pull')
const skipPublish = flags.has('no-publish')
log(c.bold('\nSpacetimeDB setup\n'))
await run('bun script/doctor.ts --stdb', { quiet: false })
const TOTAL = 3
step(1, TOTAL, 'Writing .env defaults (preserving existing values)')
patchEnvDefaults([
  ['NEXT_PUBLIC_SPACETIMEDB_URI', 'ws://localhost:4000'],
  ['SPACETIMEDB_MODULE_NAME', 'noboil'],
  ['SPACETIMEDB_URI', 'ws://localhost:4000'],
  ['SITE_URL', 'http://localhost:4200']
])
step(2, TOTAL, pull ? 'Pulling image + starting SpacetimeDB' : 'Starting SpacetimeDB (docker compose up)')
if (pull) await run('docker compose -f spacetimedb.yml pull', { quiet: false })
await run('docker compose -f spacetimedb.yml up -d --quiet-pull')
const ready = await waitHealthy('http://localhost:4000/v1/ping', 60_000)
if (!ready) {
  warn('SpacetimeDB not healthy in 60s. Logs:')
  await run('docker compose -f spacetimedb.yml logs --tail 40', { quiet: false })
  process.exit(1)
}
ok('SpacetimeDB healthy')
await run(
  `bash -lc 'PATH="$HOME/.local/bin:$PATH" spacetime server remove local 2>/dev/null || true; spacetime server add local --url http://localhost:4000 --no-fingerprint --default'`
)
ok('Registered spacetime server `local`')
if (skipPublish) {
  box('SpacetimeDB ready (publish skipped)', [`${c.bold('URL')} ws://localhost:4000`])
  process.exit(0)
}
step(3, TOTAL, 'Publishing module')
await run(
  `bash -lc 'PATH="$HOME/.local/bin:$PATH" spacetime publish noboil --module-path backend/spacetimedb --delete-data -y'`,
  { quiet: false }
)
box('SpacetimeDB ready', [
  `${c.bold('URL')}    ws://localhost:4000`,
  `${c.bold('Module')} noboil`,
  '',
  c.dim('Next: bun dev  (or bun dev:all for all demo apps)')
])
