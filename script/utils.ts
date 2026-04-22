/* eslint-disable no-continue */
/** biome-ignore-all lint/nursery/noContinue: script */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/** biome-ignore-all lint/suspicious/noControlCharactersInRegex: ANSI color codes */
/* eslint-disable no-await-in-loop, no-control-regex */
/* oxlint-disable no-await-in-loop, no-control-regex */
import { $, sleep } from 'bun'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { styleText } from 'node:util'
const ANSI_RE = /\u001B\[\d+m/gu
const root = join(import.meta.dirname, '..')
const envPath = join(root, '.env')
const stripAnsi = (s: string) => s.replaceAll(ANSI_RE, '')
const c = {
  bold: (s: string) => styleText('bold', s),
  cyan: (s: string) => styleText('cyan', s),
  dim: (s: string) => styleText('dim', s),
  green: (s: string) => styleText('green', s),
  red: (s: string) => styleText('red', s),
  yellow: (s: string) => styleText('yellow', s)
}
const log = (msg: string) => process.stdout.write(`${msg}\n`)
const step = (n: number, total: number, label: string) => log(`${c.cyan(`[${n}/${total}]`)} ${label}`)
const ok = (label: string) => log(`${c.green('✓')} ${label}`)
const warn = (label: string) => log(`${c.yellow('!')} ${label}`)
const fail = (label: string) => log(`${c.red('✗')} ${label}`)
const box = (title: string, lines: string[]) => {
  const width = Math.max(title.length, ...lines.map(l => stripAnsi(l).length)) + 4
  const top = `╭─ ${c.bold(title)} ${'─'.repeat(Math.max(0, width - title.length - 4))}╮`
  const bottom = `╰${'─'.repeat(width)}╯`
  log(`\n${top}`)
  for (const l of lines) {
    const pad = width - stripAnsi(l).length - 2
    log(`│ ${l}${' '.repeat(Math.max(0, pad))} │`)
  }
  log(`${bottom}\n`)
}
const run = async (cmd: string, { quiet = true }: { quiet?: boolean } = {}) => {
  const proc = $`bash -c ${cmd}`.cwd(root)
  const result = await (quiet ? proc.quiet() : proc).nothrow()
  if (result.exitCode !== 0) {
    if (quiet) {
      const out = result.stdout.toString().trim()
      const err = result.stderr.toString().trim()
      if (out) process.stderr.write(`${c.dim('stdout:')}\n${out}\n`)
      if (err) process.stderr.write(`${c.dim('stderr:')}\n${err}\n`)
    }
    throw new Error(`Command failed (exit ${result.exitCode}): ${cmd}`)
  }
  return result.stdout.toString().trim()
}
const readEnv = (): Record<string, string> => {
  const current: Record<string, string> = {}
  if (!existsSync(envPath)) return current
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) current[t.slice(0, i)] = t.slice(i + 1)
  }
  return current
}
const writeEnv = (data: Record<string, string>) => {
  const body = Object.entries(data)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  writeFileSync(envPath, `${body}\n`)
}
const patchEnv = (entries: [string, string][]) => {
  const current = readEnv()
  for (const [k, v] of entries) current[k] = v
  writeEnv(current)
}
const patchEnvDefaults = (entries: [string, string][]) => {
  const current = readEnv()
  for (const [k, v] of entries) current[k] ??= v
  writeEnv(current)
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
const hasDocker = async () => {
  const r = await $`docker info`.quiet().nothrow()
  return r.exitCode === 0
}
const hasCmd = async (cmd: string) => {
  const r = await $`bash -lc ${`command -v ${cmd}`}`.quiet().nothrow()
  return r.exitCode === 0
}
const portFree = async (port: number) => {
  const r = await $`bash -c ${`lsof -iTCP:${port} -sTCP:LISTEN -t`}`.quiet().nothrow()
  return r.stdout.toString().trim() === ''
}
const composeRunning = async (file: string) => {
  const r = await $`docker compose -f ${file} ps -q`.quiet().nothrow()
  return r.stdout.toString().trim().length > 0
}
const waitHealthy = async (url: string, timeout = 60_000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) }).catch(() => null)
    if (r?.ok) return true
    await sleep(500)
  }
  return false
}
const parseArgs = (argv: string[]) => {
  const flags = new Set<string>()
  for (const a of argv) if (a.startsWith('--')) flags.add(a.slice(2))
  return flags
}
export {
  box,
  c,
  composeRunning,
  envPath,
  fail,
  generateJwtKeys,
  hasCmd,
  hasDocker,
  log,
  ok,
  parseArgs,
  patchEnv,
  patchEnvDefaults,
  portFree,
  readEnv,
  root,
  run,
  step,
  stripAnsi,
  waitHealthy,
  warn
}
