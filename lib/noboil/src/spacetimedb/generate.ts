#!/usr/bin/env bun
/* eslint-disable no-console */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bold, dim, green, red, yellow } from '../ansi'
type GenerateTarget = 'docker'
const DOCKER_COMPOSE = `services:
  spacetimedb:
    image: clockworklabs/spacetime:latest
    command: start --listen-addr 0.0.0.0:3000
    ports:
      - "4000:3000"
      - "5432:5432"
    volumes:
      - spacetimedb_data:/stdb
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:3000/v1/ping 2>/dev/null || curl -fsS http://localhost:3000/database/ping 2>/dev/null || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s
volumes:
  spacetimedb_data:
`
const GENERATORS: Record<GenerateTarget, { content: string; description: string; filename: string }> = {
  docker: {
    content: DOCKER_COMPOSE,
    description: 'Docker Compose (SpacetimeDB)',
    filename: 'docker-compose.yml'
  }
}
const printGenerateHelp = () => {
  console.log(`${bold('noboil-stdb generate')} — generate project files\n`)
  console.log(bold('Usage:'))
  console.log('  noboil-stdb generate <target> [options]\n')
  console.log(bold('Targets:'))
  for (const [name, { description }] of Object.entries(GENERATORS)) console.log(`  ${name.padEnd(16)} ${dim(description)}`)
  console.log(`\n${bold('Options:')}`)
  console.log(`  --force    ${dim('Overwrite existing files')}`)
  console.log(`  --stdout   ${dim('Print to stdout instead of writing file')}\n`)
  console.log(bold('Examples:'))
  console.log(`  ${dim('$')} noboil-stdb generate docker`)
  console.log(`  ${dim('$')} noboil-stdb generate docker --stdout`)
  console.log(`  ${dim('$')} noboil-stdb generate docker --force\n`)
}
const generate = (args: string[] = []) => {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printGenerateHelp()
    return
  }
  const targetArg = args[0] ?? ''
  const force = args.includes('--force')
  const toStdout = args.includes('--stdout')
  if (!(targetArg in GENERATORS)) {
    console.log(`${red('Unknown target:')} ${targetArg}`)
    console.log(`Valid targets: ${Object.keys(GENERATORS).join(', ')}\n`)
    process.exit(1)
  }
  const gen = GENERATORS[targetArg as GenerateTarget]
  if (toStdout) {
    process.stdout.write(gen.content)
    return
  }
  const outPath = join(process.cwd(), gen.filename)
  if (existsSync(outPath) && !force) {
    console.log(`${yellow('⚠')} ${gen.filename} already exists. Use ${bold('--force')} to overwrite.`)
    return
  }
  writeFileSync(outPath, gen.content)
  console.log(`${green('✓')} Generated ${bold(gen.filename)}`)
  console.log(`  ${dim(outPath)}\n`)
  console.log(bold('Next steps:'))
  console.log(`  ${dim('1.')} docker compose up -d`)
  console.log(`  ${dim('2.')} noboil-stdb use local`)
  console.log(`  ${dim('3.')} spacetime publish <your-module> --module-path <path>\n`)
}
if (process.argv[1]?.endsWith('generate.ts')) generate(process.argv.slice(2))
export { generate }
export type { GenerateTarget }
