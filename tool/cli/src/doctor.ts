#!/usr/bin/env bun
/* eslint-disable no-console */
const HELP = `
noboil doctor — check project health
Usage:
  noboil doctor [--fix]
Options:
  --fix        Auto-remediate common issues (install deps, patch tsconfig)
  --help, -h   Show this help
`
const doctor = async (args: string[] = []) => {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    return
  }
  const fix = args.includes('--fix')
  const { runDoctorTui } = await import('./doctor-tui')
  const code = await runDoctorTui({ fix })
  if (code !== 0) process.exit(code)
}
export { doctor }
