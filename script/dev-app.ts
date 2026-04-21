/* oxlint-disable no-process-exit */
import { appPort } from '@a/config'
import { spawn } from 'bun'
import { basename, dirname } from 'node:path'
const cwd = process.cwd()
const name = basename(cwd)
const parent = basename(dirname(cwd))
const id = parent === 'cvx' || parent === 'stdb' ? `${parent}-${name}` : name
const port = appPort(id)
const proc = spawn({
  cmd: ['next', 'dev', '--turbo', '--port', String(port)],
  cwd,
  stderr: 'inherit',
  stdin: 'inherit',
  stdout: 'inherit'
})
process.on('SIGINT', () => proc.kill('SIGINT'))
process.on('SIGTERM', () => proc.kill('SIGTERM'))
process.exit(await proc.exited)
