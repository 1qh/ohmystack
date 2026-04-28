/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
import { config, urls } from '@a/config'
/* oxlint-disable no-await-in-loop, no-process-exit, no-immediate-mutation */
import { emit } from './emit-env'
import { syncConvexEnv } from './sync-convex'
import {
  box,
  c,
  generateJwtKeys,
  log,
  ok,
  parseArgs,
  patchEnv,
  patchEnvDefaults,
  readEnv,
  run,
  step,
  waitHealthy,
  warn
} from './utils'
const flags = parseArgs(process.argv.slice(2))
const fresh = flags.has('fresh')
const pull = flags.has('pull')
const skipDeploy = flags.has('no-deploy')
const u = urls()
log(c.bold('\nConvex setup\n'))
emit()
await run('bun script/doctor.ts --convex', { quiet: false })
const existing = readEnv()
const alreadySetup = Boolean(
  existing.JWT_PRIVATE_KEY && existing.JWKS && existing.JWKS !== '{"keys":[]}' && existing.CONVEX_SELF_HOSTED_ADMIN_KEY
)
const needsKeygen = fresh || !alreadySetup
const TOTAL = 5
step(1, TOTAL, needsKeygen ? 'Generating JWT keys' : 'Reusing existing setup (use --fresh to regenerate)')
const { jwks, pem } = needsKeygen ? await generateJwtKeys() : { jwks: '', pem: '' }
step(2, TOTAL, 'Writing .env')
if (needsKeygen)
  patchEnv([
    ['JWT_PRIVATE_KEY', `"${pem.trimEnd().replaceAll('\n', ' ')}"`],
    ['JWKS', jwks]
  ])
patchEnv([
  ['POSTGRES_PASSWORD', config.credentials.postgres],
  ['S3_SECRET_ACCESS_KEY', config.credentials.minio.password],
  ['S3_ACCESS_KEY_ID', config.credentials.minio.user],
  ['S3_ENDPOINT', u.minio],
  ['S3_BUCKET', config.minio.buckets.primary],
  ['CONVEX_URL', u.convexApi],
  ['CONVEX_SITE_URL', u.convexSite],
  ['CONVEX_SELF_HOSTED_URL', u.convexApi],
  ['NEXT_PUBLIC_CONVEX_URL', u.convexApi],
  ['SITE_URL', u.siteCvx]
])
patchEnvDefaults([
  ['TMDB_KEY', ''],
  ['AUTH_GOOGLE_ID', ''],
  ['AUTH_GOOGLE_SECRET', '']
])
step(3, TOTAL, pull ? 'Pulling images + starting Convex' : 'Starting Convex (docker compose up)')
if (pull) await run('docker compose -f convex.yml pull', { quiet: false })
await run('docker compose -f convex.yml up -d --quiet-pull')
const ready = await waitHealthy(`${u.convexApi}/version`, 120_000)
if (!ready) {
  warn('Convex backend not healthy in 120s. Logs:')
  await run('docker compose -f convex.yml logs --tail 40 backend', { quiet: false })
  process.exit(1)
}
ok('Convex backend healthy')
step(4, TOTAL, 'Generating admin key')
const adminKeyRaw = await run('docker compose -f convex.yml exec -T backend ./generate_admin_key.sh')
const adminKeyRe = new RegExp(`${config.convex.adminKeyPrefix}\\|[a-f0-9]+`, 'u')
const adminKeyMatch = adminKeyRe.exec(adminKeyRaw)
if (!adminKeyMatch) throw new Error(`Failed to parse admin key: ${adminKeyRaw.slice(0, 200)}`)
const adminKey = adminKeyMatch[0]
patchEnv([['CONVEX_SELF_HOSTED_ADMIN_KEY', adminKey]])
ok(`Admin key: ${c.dim(`${adminKey.slice(0, 26)}…${adminKey.slice(-6)}`)}`)
if (skipDeploy) {
  box('Convex ready (deploy skipped)', [`${c.bold('API')} ${u.convexApi} · ${c.bold('Dashboard')} ${u.convexDashboard}`])
  process.exit(0)
}
step(5, TOTAL, 'Pushing backend env + deploying functions')
const reread = readEnv()
await syncConvexEnv(needsKeygen ? { jwks, pem } : {})
await run(`cd ${config.paths.backendConvex} && nb-env npx convex dev --once`, { quiet: false })
const feat = [
  reread.AUTH_GOOGLE_ID
    ? `${c.green('✓')} Google OAuth`
    : `${c.yellow('○')} Google OAuth ${c.dim('(set AUTH_GOOGLE_ID/SECRET in .env, then rerun)')}`,
  reread.TMDB_KEY
    ? `${c.green('✓')} TMDB (movie app)`
    : `${c.yellow('○')} TMDB ${c.dim('(set TMDB_KEY in .env for movie app)')}`
]
box('Convex ready', [
  `${c.bold('API')}       ${u.convexApi}`,
  `${c.bold('Site')}      ${u.convexSite}`,
  `${c.bold('Dashboard')} ${u.convexDashboard}`,
  `${c.bold('MinIO')}     ${u.minioConsole} ${c.dim(`(${config.credentials.minio.user} / ${config.credentials.minio.password})`)}`,
  '',
  c.bold('Features'),
  ...feat,
  '',
  c.dim('Next: bun dev:all')
])
