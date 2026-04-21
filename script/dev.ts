/* eslint-disable no-continue */
/** biome-ignore-all lint/nursery/noContinue: script */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/** biome-ignore-all lint/suspicious/noEmptyBlockStatements: keep process alive */
/* eslint-disable no-await-in-loop, no-empty */
import { allAppPorts, config } from '@a/config'
/* oxlint-disable no-await-in-loop, no-process-exit */
import { sleep, spawn } from 'bun'
import { existsSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'
import { box, c, log, ok, portFree, root, warn } from './utils'
interface App {
  dir: string
  name: string
  port: number
}
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
const onlyArg = arg('apps')
const only = onlyArg ? new Set(onlyArg.split(',').map(s => s.trim())) : null
const appDir = (id: string): string => {
  if (id === 'doc') return join(root, config.paths.doc)
  const [kind, name] = id.split('-')
  if (!name) throw new Error(`Bad app id: ${id}`)
  const parentPath = kind === 'cvx' ? config.paths.webCvx : kind === 'stdb' ? config.paths.webStdb : ''
  if (!parentPath) throw new Error(`Unknown app kind: ${kind}`)
  return join(root, parentPath, name)
}
const all: App[] = Object.entries(allAppPorts())
  .filter(([id]) => (only ? only.has(id) : true))
  .map(([id, port]) => ({ dir: appDir(id), name: id, port }))
  .filter(a => existsSync(join(a.dir, 'package.json')))
if (all.length === 0) {
  warn('No apps found.')
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
  const fd = openSync(join(logDir, `${app.name}.log`), 'w')
  const proc = spawn({
    cmd: ['bun', 'run', 'dev'],
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
