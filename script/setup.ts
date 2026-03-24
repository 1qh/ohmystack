import { $ } from 'bun'
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const root = join(import.meta.dirname, '..'),
  envPath = join(root, '.env'),
  log = (msg: string) => process.stdout.write(`${msg}\n`),
  run = async (cmd: string) => {
    log(`> ${cmd}`)
    const result = await $`bash -c ${cmd}`.cwd(root).quiet()
    if (result.exitCode !== 0) {
      process.stderr.write(result.stderr.toString())
      throw new Error(`Command failed: ${cmd}`)
    }
    return result.stdout.toString().trim()
  },
  readExistingEnv = (): Record<string, string> => {
    if (!existsSync(envPath)) return {}
    const lines = readFileSync(envPath, 'utf8').split('\n'),
      env: Record<string, string> = {}
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
      }
    }
    return env
  }
log('=== noboil setup ===\n')
const existing = readExistingEnv()
log('[1/7] Generating JWT keys...')
const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true }),
  privateK = await exportPKCS8(privateKey),
  publicK = await exportJWK(publicKey),
  jwks = JSON.stringify({ keys: [{ use: 'sig', ...publicK }] })
log('[2/7] Writing .env (preserving existing secrets)...')
const tmdbKey = existing.TMDB_KEY ?? '',
  googleId = existing.AUTH_GOOGLE_ID ?? '',
  googleSecret = existing.AUTH_GOOGLE_SECRET ?? ''
if (!tmdbKey) log('   WARNING: TMDB_KEY not set — add it to .env manually')
const envContent = [
  'POSTGRES_PASSWORD=postgres',
  'S3_SECRET_ACCESS_KEY=minioadmin',
  '',
  'CONVEX_URL=http://127.0.0.1:4001',
  'CONVEX_SITE_URL=http://127.0.0.1:4002',
  'CONVEX_SELF_HOSTED_URL=http://127.0.0.1:4001',
  'CONVEX_SELF_HOSTED_ADMIN_KEY=placeholder',
  'NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:4001',
  '',
  'NEXT_PUBLIC_SPACETIMEDB_URI=ws://localhost:4000',
  'SPACETIMEDB_MODULE_NAME=noboil',
  'SPACETIMEDB_URI=ws://localhost:4000',
  'S3_ACCESS_KEY_ID=minioadmin',
  'S3_ENDPOINT=http://localhost:4600',
  'S3_BUCKET=mybucket',
  '',
  `JWT_PRIVATE_KEY="${privateK.trimEnd().replaceAll('\n', ' ')}"`,
  `JWKS=${jwks}`,
  '',
  'SITE_URL=http://localhost:4000',
  `TMDB_KEY=${tmdbKey}`,
  `AUTH_GOOGLE_ID=${googleId}`,
  `AUTH_GOOGLE_SECRET=${googleSecret}`,
  ''
].join('\n')
writeFileSync(envPath, envContent)
log('[3/7] Starting Convex...')
await run('bun convex:up')
log('[4/7] Starting SpacetimeDB...')
await run('bun spacetime:up')
log('[5/7] Generating Convex admin key...')
const adminKeyRaw = await run('docker compose -f convex.yml exec -T backend ./generate_admin_key.sh'),
  adminKeyMatch = /convex-self-hosted\|[a-f0-9]+/u.exec(adminKeyRaw)
if (!adminKeyMatch) throw new Error(`Failed to parse admin key from: ${adminKeyRaw}`)
const adminKey = adminKeyMatch[0]
log(`   Key: ${adminKey.slice(0, 30)}...`)
writeFileSync(
  envPath,
  envContent.replace('CONVEX_SELF_HOSTED_ADMIN_KEY=placeholder', `CONVEX_SELF_HOSTED_ADMIN_KEY=${adminKey}`)
)
log('[6/7] Deploying Convex backend...')
const tmpFile = join(root, '.tmp-env-val'),
  setEnv = async (k: string, v: string) => {
    writeFileSync(tmpFile, v)
    await run(`cd backend/convex && bun with-env npx convex env set ${k} -- "$(cat ${tmpFile})"`)
  }
if (tmdbKey) await setEnv('TMDB_KEY', tmdbKey)
await setEnv('CONVEX_TEST_MODE', 'true')
await setEnv('CI', '')
await setEnv('SITE_URL', 'http://localhost:4000')
await setEnv('JWKS', jwks)
await setEnv('JWT_PRIVATE_KEY', privateK.trimEnd())
await run('rm -f .tmp-env-val')
log('   Deploying...')
await run('cd backend/convex && bun with-env npx convex dev --once')
log('[7/7] Publishing SpacetimeDB module...')
await run(
  'bash -lc \'PATH="$HOME/.local/bin:$PATH" spacetime publish noboil --module-path backend/spacetimedb --delete-data -y\''
)
log('\n=== Setup complete ===')
