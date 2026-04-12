import { log, patchEnv, run } from './utils'
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
