/* oxlint-disable no-process-exit */
import { spawn } from 'bun'
import { basename, dirname } from 'node:path'
import { appPort } from '../noboil.config'
const cwd = process.cwd()
const name = basename(cwd)
const parent = basename(dirname(cwd))
const id = parent === 'cvx' || parent === 'stdb' ? `${parent}-${name}` : name
const port = appPort(id)
const proc = spawn({
  cmd: ['nb-env', 'next', 'dev', '--turbo', '--port', String(port)],
  cwd,
  stderr: 'inherit',
  stdin: 'inherit',
  stdout: 'inherit'
})
process.on('SIGINT', () => proc.kill('SIGINT'))
process.on('SIGTERM', () => proc.kill('SIGTERM'))
process.exit(await proc.exited)
