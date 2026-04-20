/* oxlint-disable no-process-exit */
import { spawn } from 'bun'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { appPort } from '../noboil.config'
const cwd = process.cwd()
const name = basename(cwd)
const parent = basename(dirname(cwd))
const id = parent === 'cvx' || parent === 'stdb' ? `${parent}-${name}` : name
const port = appPort(id)
const pkgPath = join(cwd, 'package.json')
if (!existsSync(pkgPath)) throw new Error(`No package.json at ${cwd}`)
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> }
const hasWithEnv = Boolean(pkg.scripts?.['with-env'])
const cmd = hasWithEnv
  ? ['bun', 'with-env', 'next', 'dev', '--turbo', '--port', String(port)]
  : ['next', 'dev', '--turbo', '--port', String(port)]
const proc = spawn({ cmd, cwd, stderr: 'inherit', stdin: 'inherit', stdout: 'inherit' })
process.on('SIGINT', () => proc.kill('SIGINT'))
process.on('SIGTERM', () => proc.kill('SIGTERM'))
process.exit(await proc.exited)
