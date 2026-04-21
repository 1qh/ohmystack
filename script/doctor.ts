/** biome-ignore-all lint/performance/useTopLevelRegex: script */
/* oxlint-disable no-process-exit, no-await-expression-member */
import { config } from '@a/config'
import { $ } from 'bun'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { box, c, composeRunning, fail, hasCmd, hasDocker, log, ok, parseArgs, portFree, root, warn } from './utils'
interface CheckResult {
  hint?: string
  label: string
  pass: boolean
}
const flags = parseArgs(process.argv.slice(2))
const want = {
  convex: flags.has('convex') || flags.has('all') || !(flags.has('convex') || flags.has('stdb')),
  stdb: flags.has('stdb') || flags.has('all') || !(flags.has('convex') || flags.has('stdb'))
}
const core: (() => Promise<CheckResult>)[] = [
  async () => ({
    hint: 'Install bun: curl -fsSL https://bun.sh/install | bash',
    label: 'bun CLI',
    pass: await hasCmd('bun')
  }),
  async () => ({
    hint: 'Install Docker Desktop: https://docker.com',
    label: 'docker daemon',
    pass: await hasDocker()
  })
]
const convexPorts = [
  config.ports.convexApi,
  config.ports.convexSite,
  config.ports.convexDashboard,
  config.ports.minio,
  config.ports.minioConsole
]
const stdbPorts = [config.ports.stdb]
const convexChecks: (() => Promise<CheckResult>)[] = [
  async () => {
    if (await composeRunning('convex.yml')) return { label: 'Convex compose already running (will reuse)', pass: true }
    const busy = (await Promise.all(convexPorts.map(async p => ({ free: await portFree(p), p })))).filter(x => !x.free)
    return {
      hint: busy.length > 0 ? `Port(s) ${busy.map(b => b.p).join(', ')} busy (non-noboil). Stop them first.` : undefined,
      label: `Convex ports free (${convexPorts.join(', ')})`,
      pass: busy.length === 0
    }
  }
]
const stdbChecks: (() => Promise<CheckResult>)[] = [
  async () => ({
    hint: 'Install: curl -sSf https://install.spacetimedb.com | sh',
    label: 'spacetime CLI',
    pass: await hasCmd('spacetime')
  }),
  async () => {
    if (await composeRunning('spacetimedb.yml'))
      return { label: 'SpacetimeDB compose already running (will reuse)', pass: true }
    const busy = (await Promise.all(stdbPorts.map(async p => ({ free: await portFree(p), p })))).filter(x => !x.free)
    return {
      hint: busy.length > 0 ? `Port(s) ${busy.map(b => b.p).join(', ')} busy (non-noboil). Stop them first.` : undefined,
      label: `SpacetimeDB ports free (${stdbPorts.join(', ')})`,
      pass: busy.length === 0
    }
  },
  async () => {
    const pkgPath = join(root, 'node_modules/spacetimedb/package.json')
    if (!existsSync(pkgPath)) return { hint: 'Run `bun i`', label: 'spacetimedb SDK installed', pass: false }
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }
    const sdkVer = pkg.version
    const r = await $`bash -lc 'PATH="$HOME/.local/bin:$PATH" spacetime --version 2>/dev/null'`.quiet().nothrow()
    const verMatch = /tool version (?<v>\d+\.\d+\.\d+)/u.exec(r.stdout.toString())
    const cliVer = verMatch?.groups?.v ?? ''
    const match = Boolean(cliVer) && sdkVer.startsWith(cliVer.split('.').slice(0, 2).join('.'))
    return {
      hint: match ? undefined : `CLI ${cliVer || 'unknown'} vs SDK ${sdkVer}. Run: spacetime version upgrade`,
      label: `spacetime CLI ↔ SDK version match (${cliVer || '?'} ↔ ${sdkVer})`,
      pass: match
    }
  }
]
const all = [...core, ...(want.convex ? convexChecks : []), ...(want.stdb ? stdbChecks : [])]
log(c.bold('doctor — environment preflight\n'))
const results = await Promise.all(all.map(async fn => fn()))
for (const r of results)
  if (r.pass) ok(r.label)
  else {
    fail(r.label)
    if (r.hint) warn(`  → ${r.hint}`)
  }
const passed = results.filter(r => r.pass).length
const total = results.length
box('doctor result', [
  `${passed}/${total} checks passed`,
  passed === total ? c.green('ready to setup') : c.red('fix the above before setup')
])
process.exit(passed === total ? 0 : 1)
