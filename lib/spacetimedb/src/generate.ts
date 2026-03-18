#!/usr/bin/env bun
/* eslint-disable no-console */

import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type GenerateTarget = 'docker'

const DOCKER_COMPOSE = `services:
  spacetimedb:
    image: clockworklabs/spacetime:latest
    command: start --listen-addr 0.0.0.0:3000
    ports:
      - "3000:3000"
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

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:9000/minio/health/live || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 5
      start_period: 5s

volumes:
  spacetimedb_data:
  minio_data:
`,
  green = (s: string) => `\u001B[32m${s}\u001B[0m`,
  yellow = (s: string) => `\u001B[33m${s}\u001B[0m`,
  red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  GENERATORS: Record<GenerateTarget, { content: string; description: string; filename: string }> = {
    docker: {
      content: DOCKER_COMPOSE,
      description: 'Docker Compose (SpacetimeDB + MinIO)',
      filename: 'docker-compose.yml'
    }
  },
  printGenerateHelp = () => {
    console.log(`${bold('noboil-stdb generate')} — generate project files\n`)
    console.log(bold('Usage:'))
    console.log('  noboil-stdb generate <target> [options]\n')
    console.log(bold('Targets:'))
    for (const [name, { description }] of Object.entries(GENERATORS))
      console.log(`  ${name.padEnd(16)} ${dim(description)}`)
    console.log(`\n${bold('Options:')}`)
    console.log(`  --force    ${dim('Overwrite existing files')}`)
    console.log(`  --stdout   ${dim('Print to stdout instead of writing file')}\n`)
    console.log(bold('Examples:'))
    console.log(`  ${dim('$')} noboil-stdb generate docker`)
    console.log(`  ${dim('$')} noboil-stdb generate docker --stdout`)
    console.log(`  ${dim('$')} noboil-stdb generate docker --force\n`)
  },
  generate = (args: string[] = []) => {
    if (args.includes('--help') || args.includes('-h') || args.length === 0) {
      printGenerateHelp()
      return
    }

    const targetArg = args[0] ?? '',
      force = args.includes('--force'),
      toStdout = args.includes('--stdout')

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
