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
const generateJwtKeys = async () => {
  const { subtle } = globalThis.crypto
  const keyPair = await subtle.generateKey(
    { hash: 'SHA-256', modulusLength: 2048, name: 'RSASSA-PKCS1-v1_5', publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['sign', 'verify']
  )
  const pkcs8 = await subtle.exportKey('pkcs8', keyPair.privateKey)
  const b64 = Buffer.from(pkcs8).toString('base64')
  const pem = `-----BEGIN PRIVATE KEY-----\n${(b64.match(/.{1,64}/gu) ?? []).join('\n')}\n-----END PRIVATE KEY-----`
  const jwk = await subtle.exportKey('jwk', keyPair.publicKey)
  const jwks = JSON.stringify({ keys: [{ use: 'sig', ...jwk }] })
  return { jwks, pem }
}
log('=== Convex setup ===\n')
const existing: Record<string, string> = {}
if (existsSync(envPath))
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) existing[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
    }
  }
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
await setEnv('CONVEX_TEST_MODE', 'true')
await setEnv('CI', '')
await setEnv('SITE_URL', 'http://localhost:4100')
await setEnv('JWKS', jwks)
await setEnv('JWT_PRIVATE_KEY', pem.trimEnd())
await run('rm -f .tmp-env-val')
log('   Deploying...')
await run('cd backend/convex && bun with-env npx convex dev --once')
log('\n=== Convex ready ===')
