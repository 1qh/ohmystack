#!/usr/bin/env bun
/* eslint-disable no-console */
import { existsSync, readFileSync } from 'node:fs'
import { LOG_PATH } from './shared/crash-log'
const HELP = `
noboil doctor — check project health
Usage:
  noboil doctor [--fix] [--last-error]
Options:
  --fix          Auto-remediate common issues (install deps, patch tsconfig)
  --last-error   Print the most recent crash log
  --help, -h     Show this help
`
const doctor = async (args: string[] = []) => {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    return
  }
  if (args.includes('--last-error')) {
    const path = LOG_PATH()
    if (existsSync(path)) console.log(readFileSync(path, 'utf8'))
    else console.log('No crash log found.')
    return
  }
  const fix = args.includes('--fix')
  const { runDoctorTui } = await import('./doctor-tui')
  const code = await runDoctorTui({ fix })
  if (code !== 0) process.exit(code)
}
export { doctor }
