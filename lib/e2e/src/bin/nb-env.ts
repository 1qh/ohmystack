#!/usr/bin/env bun
/** biome-ignore-all lint/nursery/noContinue: parser */
/** biome-ignore-all lint/style/noProcessEnv: env loader */
/* eslint-disable no-continue */
import { spawn } from 'bun'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
const findRepoRoot = (start: string): string => {
  let cur = start
  while (cur !== '/') {
    if (existsSync(resolve(cur, 'noboil.config.ts'))) return cur
    cur = dirname(cur)
  }
  throw new Error(`Could not find repo root (noboil.config.ts) from ${start}`)
}
const root = findRepoRoot(process.cwd())
const envPath = resolve(root, '.env')
if (existsSync(envPath))
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const k = t.slice(0, i)
    let v = t.slice(i + 1)
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
const args = process.argv.slice(2)
let cwd = process.cwd()
while (args[0]?.startsWith('--cwd=')) {
  const val = args[0].slice('--cwd='.length)
  cwd = resolve(cwd, val)
  args.shift()
}
if (args.length === 0) {
  process.stderr.write('nb-env: no command provided\n')
  process.exit(1)
}
const proc = spawn({ cmd: args, cwd, env: process.env, stderr: 'inherit', stdin: 'inherit', stdout: 'inherit' })
process.on('SIGINT', () => proc.kill('SIGINT'))
process.on('SIGTERM', () => proc.kill('SIGTERM'))
process.exit(await proc.exited)
