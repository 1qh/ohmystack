import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateJwtKeys, log, patchEnv, readEnv, root, run } from './utils'
log('=== Convex setup ===\n')
const existing = readEnv()
log('[1/5] Generating JWT keys...')
const { jwks, pem } = await generateJwtKeys()
log('[2/5] Writing .env...')
patchEnv([
  ['POSTGRES_PASSWORD', 'postgres'],
  ['S3_SECRET_ACCESS_KEY', 'minioadmin'],
  ['S3_ACCESS_KEY_ID', 'minioadmin'],
  ['S3_ENDPOINT', 'http://localhost:4600'],
  ['S3_BUCKET', 'mybucket'],
  ['CONVEX_URL', 'http://127.0.0.1:4001'],
  ['CONVEX_SITE_URL', 'http://127.0.0.1:4002'],
  ['CONVEX_SELF_HOSTED_URL', 'http://127.0.0.1:4001'],
  ['CONVEX_SELF_HOSTED_ADMIN_KEY', 'placeholder'],
  ['NEXT_PUBLIC_CONVEX_URL', 'http://127.0.0.1:4001'],
  ['JWT_PRIVATE_KEY', `"${pem.trimEnd().replaceAll('\n', ' ')}"`],
  ['JWKS', jwks],
  ['SITE_URL', 'http://localhost:4100'],
  ['TMDB_KEY', existing.TMDB_KEY ?? ''],
  ['AUTH_GOOGLE_ID', existing.AUTH_GOOGLE_ID ?? ''],
  ['AUTH_GOOGLE_SECRET', existing.AUTH_GOOGLE_SECRET ?? '']
])
log('[3/5] Starting Convex...')
await run('bun convex:up')
log('[4/5] Generating admin key...')
const adminKeyRaw = await run('docker compose -f convex.yml exec -T backend ./generate_admin_key.sh')
const adminKeyMatch = /convex-self-hosted\|[a-f0-9]+/u.exec(adminKeyRaw)
if (!adminKeyMatch) throw new Error(`Failed to parse admin key from: ${adminKeyRaw}`)
const adminKey = adminKeyMatch[0]
log(`   Key: ${adminKey.slice(0, 30)}...`)
patchEnv([['CONVEX_SELF_HOSTED_ADMIN_KEY', adminKey]])
log('[5/5] Deploying backend...')
const tmpFile = join(root, '.tmp-env-val')
const setEnv = async (k: string, v: string) => {
  writeFileSync(tmpFile, v)
  await run(`cd backend/convex && bun with-env npx convex env set ${k} -- "$(cat ${tmpFile})"`)
}
if (existing.TMDB_KEY) await setEnv('TMDB_KEY', existing.TMDB_KEY)
if (existing.AUTH_GOOGLE_ID) await setEnv('AUTH_GOOGLE_ID', existing.AUTH_GOOGLE_ID)
if (existing.AUTH_GOOGLE_SECRET) await setEnv('AUTH_GOOGLE_SECRET', existing.AUTH_GOOGLE_SECRET)
await setEnv('CONVEX_TEST_MODE', 'true')
await setEnv('CI', '')
await setEnv('SITE_URL', 'http://localhost:4100')
await setEnv('JWKS', jwks)
await setEnv('JWT_PRIVATE_KEY', pem.trimEnd())
await run('rm -f .tmp-env-val')
log('   Deploying...')
await run('cd backend/convex && bun with-env npx convex dev --once')
log('\n=== Convex ready ===')
