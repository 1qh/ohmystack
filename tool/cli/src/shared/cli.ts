/* eslint-disable no-console */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
interface CliTheme {
  bold: (s: string) => string
  cyan: (s: string) => string
  dim: (s: string) => string
  green: (s: string) => string
  red: (s: string) => string
  yellow: (s: string) => string
}
interface ParseEnumFieldResult<T extends string> {
  name: string
  optional: boolean
  type: T | { enum: string[] }
}
const ansi = (code: number, s: string) => `\u001B[${String(code)}m${s}\u001B[0m`
const createCliTheme = (): CliTheme => ({
  bold: s => ansi(1, s),
  cyan: s => ansi(36, s),
  dim: s => ansi(2, s),
  green: s => ansi(32, s),
  red: s => ansi(31, s),
  yellow: s => ansi(33, s)
})
const CAMEL_PAT = /(?<upper>[A-Z])/gu
const FIRST_CHAR_PAT = /^./u
const camelToTitle = (s: string) => s.replace(CAMEL_PAT, ' $1').replace(FIRST_CHAR_PAT, c => c.toUpperCase())
const ENUM_PAT = /^enum\((?<values>[^)]+)\)$/u
const parseEnumFieldDef = <T extends string>(raw: string, validTypes: Set<T>): null | ParseEnumFieldResult<T> => {
  const parts = raw.split(':')
  if (parts.length !== 2) return null
  const name = (parts[0] ?? '').trim()
  let typePart = (parts[1] ?? '').trim()
  let optional = false
  if (typePart.endsWith('?')) {
    optional = true
    typePart = typePart.slice(0, -1)
  }
  const enumMatch = ENUM_PAT.exec(typePart)
  if (enumMatch?.groups?.values) {
    const values = enumMatch.groups.values.split(',').map(v => v.trim())
    return { name, optional, type: { enum: values } }
  }
  if (!validTypes.has(typePart as T)) return null
  return { name, optional, type: typePart as T }
}
const hasFlag = (args: string[], ...flags: string[]) => {
  for (const arg of args) if (flags.includes(arg)) return true
  return false
}
const readEqFlag = (args: string[], name: string, fallback: string): string => {
  const prefix = `--${name}=`
  for (const arg of args) if (arg.startsWith(prefix)) return arg.slice(prefix.length)
  return fallback
}
const readArgOrEqFlag = (args: string[], name: string, fallback: string): string => {
  const eq = readEqFlag(args, name, fallback)
  if (eq !== fallback) return eq
  const full = `--${name}`
  for (let i = 0; i < args.length; i += 1)
    if (args[i] === full) {
      const nextArg = args[i + 1]
      if (nextArg) return nextArg
    }
  return fallback
}
const writeIfNotExists = ({
  content,
  label,
  path,
  theme
}: {
  content: string
  label: string
  path: string
  theme: Pick<CliTheme, 'dim' | 'green' | 'yellow'>
}): boolean => {
  if (existsSync(path)) {
    console.log(`  ${theme.yellow('skip')} ${label} ${theme.dim('(exists)')}`)
    return false
  }
  const dir = path.slice(0, path.lastIndexOf('/'))
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, content)
  console.log(`  ${theme.green('✓')} ${label}`)
  return true
}
const writeFilesToDir = ({
  baseDir,
  files,
  label,
  theme
}: {
  baseDir: string
  files: [string, string][]
  label: string
  theme: Pick<CliTheme, 'dim' | 'green' | 'yellow'>
}) => {
  if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true })
  let created = 0
  let skipped = 0
  for (const [name, content] of files) {
    const path = join(baseDir, name)
    if (writeIfNotExists({ content, label: `${label}/${name}`, path, theme })) created += 1
    else skipped += 1
  }
  return { created, skipped }
}
export {
  camelToTitle,
  createCliTheme,
  hasFlag,
  parseEnumFieldDef,
  readArgOrEqFlag,
  readEqFlag,
  writeFilesToDir,
  writeIfNotExists
}
export type { CliTheme, ParseEnumFieldResult }
