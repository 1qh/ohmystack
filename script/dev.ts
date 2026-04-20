/** biome-ignore-all lint/nursery/noContinue: script */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/** biome-ignore-all lint/suspicious/noEmptyBlockStatements: keep process alive */
/* eslint-disable no-await-in-loop, no-continue, no-empty */
/* oxlint-disable no-await-in-loop, no-continue, no-process-exit */
import { sleep, spawn } from 'bun'
import { existsSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'
import { box, c, log, ok, portFree, root, warn } from './utils'
interface App {
  dir: string
  name: string
  port: number
}
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? undefined
const onlyArg = arg('apps')
const only = onlyArg ? new Set(onlyArg.split(',').map(s => s.trim())) : null
const PORT_MAP: Record<string, number> = {
  'cvx-blog': 4100,
  'cvx-chat': 4101,
  'cvx-movie': 4102,
  'cvx-org': 4103,
  doc: 4300,
  'stdb-blog': 4200,
  'stdb-chat': 4201,
  'stdb-movie': 4202,
  'stdb-org': 4203
}
const discover = (): App[] => {
  const apps: App[] = []
  for (const kind of ['cvx', 'stdb'] as const) {
    const dir = join(root, 'web', kind)
    if (!existsSync(dir)) continue
    for (const name of ['blog', 'chat', 'movie', 'org']) {
      const appDir = join(dir, name)
      const id = `${kind}-${name}`
      if (existsSync(join(appDir, 'package.json')) && PORT_MAP[id])
        apps.push({ dir: appDir, name: id, port: PORT_MAP[id] })
    }
  }
  if (existsSync(join(root, 'doc/package.json'))) apps.push({ dir: join(root, 'doc'), name: 'doc', port: PORT_MAP.doc })
  return apps
}
const all = discover().filter(a => (only ? only.has(a.name) : true))
if (all.length === 0) {
  warn('No apps found. Expected web/cvx/*, web/stdb/*, or doc/.')
  process.exit(1)
}
const logDir = join(root, '.cache/dev-logs')
mkdirSync(logDir, { recursive: true })
log(c.bold(`\nStarting ${all.length} app${all.length > 1 ? 's' : ''}\n`))
const procs: { app: App; proc: ReturnType<typeof spawn> }[] = []
const occupied: App[] = []
for (const app of all) {
  if (!(await portFree(app.port))) {
    occupied.push(app)
    continue
  }
  const logPath = join(logDir, `${app.name}.log`)
  const fd = openSync(logPath, 'w')
  const isNext = app.name !== 'doc'
  const cmd = isNext ? ['bun', 'with-env', 'next', 'dev', '--port', String(app.port)] : ['bun', 'run', 'dev']
  const proc = spawn({
    cmd,
    cwd: app.dir,
    stderr: fd,
    stdin: 'ignore',
    stdout: fd
  })
  procs.push({ app, proc })
  log(`  ${c.dim('→')} ${app.name.padEnd(12)} :${app.port} ${c.dim(`(pid ${proc.pid})`)}`)
}
if (occupied.length > 0) warn(`Skipped (port busy): ${occupied.map(a => `${a.name}:${a.port}`).join(', ')}`)
const shutdown = () => {
  log(c.dim('\nShutting down…'))
  for (const { proc } of procs)
    try {
      proc.kill()
    } catch {}
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
log(c.dim('\nWaiting for apps to respond…'))
const healthTimeout = 90_000
const results = await Promise.all(
  procs.map(async ({ app }) => {
    const start = Date.now()
    while (Date.now() - start < healthTimeout) {
      const r = await fetch(`http://localhost:${app.port}/`, { signal: AbortSignal.timeout(1500) }).catch(() => null)
      if (r && r.status < 500) return { app, ok: true }
      await sleep(500)
    }
    return { app, ok: false }
  })
)
const healthy = results.filter(r => r.ok).map(r => r.app)
const unhealthy = results.filter(r => !r.ok).map(r => r.app)
for (const a of healthy) ok(`${a.name.padEnd(12)} http://localhost:${a.port}`)
for (const a of unhealthy) warn(`${a.name.padEnd(12)} no response (check ${logDir}/${a.name}.log)`)
box('dev running', [
  ...healthy.map(a => `${c.bold(a.name.padEnd(12))} http://localhost:${a.port}`),
  '',
  c.dim(`Logs: ${logDir}`),
  c.dim('Ctrl+C to stop all')
])
await new Promise(() => {
  /* Empty */
})
