/** biome-ignore-all lint/nursery/noContinue: classify-or-skip loop */
/** biome-ignore-all lint/performance/useTopLevelRegex: codegen script */
/* eslint-disable no-continue */
/* oxlint-disable eslint-plugin-unicorn(prefer-spread) */
import { Glob } from 'bun'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const TIER_ADMIN_PREFIX = '_admin'
const SKIP_DIRS = new Set(['_app', '_lib', 'generated'])
const CAMEL_RE = /[A-Z]/gu
const camelToKebab = (s: string): string => s.replace(CAMEL_RE, m => `-${m.toLowerCase()}`)
interface ToolFile {
  absPath: string
  cliPath: string[]
  exportName: 'action' | 'mutation' | 'query'
  fnAccessor: string
  importPath: string
  importVar: string
  kind: 'action' | 'mutation' | 'query'
  modulePath: string[]
  registryKey: string
  tier: 'admin' | 'user'
}
const KIND_RE = /(?:export )?const (?<exp>action|query|mutation) = define(?<def>Tool|Query|Mutation)\(/u
const detectKind = async (
  abs: string
): Promise<null | { exportName: 'action' | 'mutation' | 'query'; kind: 'action' | 'mutation' | 'query' }> => {
  const text = await readFile(abs, 'utf8')
  const m = KIND_RE.exec(text)
  if (!m) return null
  const exportName = (m.groups as { def: string; exp: string }).exp as 'action' | 'mutation' | 'query'
  const kindMap = { Mutation: 'mutation', Query: 'query', Tool: 'action' } as const
  const kind = kindMap[(m.groups as { def: string; exp: string }).def as 'Mutation' | 'Query' | 'Tool']
  return { exportName, kind }
}
const collect = async (toolsRoot: string): Promise<{ providers: string[]; tools: ToolFile[] }> => {
  const tools: ToolFile[] = []
  const providers = new Set<string>()
  const glob = new Glob('*/**/*.ts')
  for await (const rel of glob.scan({ cwd: toolsRoot })) {
    const segments = rel.split('/')
    const [provider] = segments
    const filename = segments.at(-1)
    if (!(provider && filename) || segments.length < 2) continue
    if (SKIP_DIRS.has(provider)) continue
    if (segments.slice(1).some(s => s.startsWith('_'))) continue
    providers.add(provider)
    const baseName = filename.replace(/\.ts$/u, '')
    const moduleSegs = segments.slice(0, -1).concat(baseName)
    const cliSegs = moduleSegs.map((s, i) => (i === 0 ? camelToKebab(s.replace(/^_/u, '')) : camelToKebab(s)))
    const tier = provider.startsWith(TIER_ADMIN_PREFIX) ? 'admin' : 'user'
    const importPath = `../${moduleSegs.join('/')}`
    const importVar = `${moduleSegs.map((s, i) => (i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1))).join('')}_mod`
    const absPath = resolve(toolsRoot, rel)
    const detected = await detectKind(absPath)
    if (!detected) continue
    const fnAccessor = `internal.tools.${moduleSegs.join('.')}.${detected.exportName}`
    tools.push({
      absPath,
      cliPath: cliSegs,
      exportName: detected.exportName,
      fnAccessor,
      importPath,
      importVar,
      kind: detected.kind,
      modulePath: moduleSegs,
      registryKey: cliSegs.join('.'),
      tier
    })
  }
  return {
    providers: [...providers].toSorted(),
    tools: tools.toSorted((a, b) => a.registryKey.localeCompare(b.registryKey))
  }
}
export { camelToKebab, collect }
export type { ToolFile }
