import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
const reExportPat =
  /export\s+(?<typeKw>type\s+)?\{\s*(?<sym>(?:default\s+as\s+)?\w+)\s*\}\s*from\s*['"](?<src>[^'"]+)['"]/gu
const tsExtPat = /\.ts$/u
const leadingWsPat = /^\s+/u
const trailingWsPat = /\s+$/u
const jsdocStarPat = /^\s*\*\s?/gmu
const green = (s: string) => `\u001B[32m${s}\u001B[0m`
const resolveReExports = (
  indexContent: string
): { isDefault: boolean; isType: boolean; sourcePath: string; symbol: string }[] => {
  const results: { isDefault: boolean; isType: boolean; sourcePath: string; symbol: string }[] = []
  let m = reExportPat.exec(indexContent)
  while (m) {
    const raw = m.groups?.sym ?? ''
    const src = m.groups?.src ?? ''
    const isType = (m.groups?.typeKw ?? '').trim() === 'type'
    const isDefault = raw.startsWith('default as')
    const symbol = isDefault ? raw.replace('default as ', '').trim() : raw.trim()
    if (symbol && src) results.push({ isDefault, isType, sourcePath: src, symbol })
    m = reExportPat.exec(indexContent)
  }
  reExportPat.lastIndex = 0
  return results
}
const extractJSDoc = (fileContent: string, symbolName: string): string => {
  const escaped = symbolName.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)
  const patterns = [
    new RegExp(`/\\*\\*([\\s\\S]*?)\\*/\\s*(?:export\\s+)?const\\s+${escaped}\\b`, 'u'),
    new RegExp(`/\\*\\*([\\s\\S]*?)\\*/\\s*(?:export\\s+)?interface\\s+${escaped}\\b`, 'u'),
    new RegExp(`/\\*\\*([\\s\\S]*?)\\*/\\s*(?:export\\s+)?type\\s+${escaped}\\b`, 'u')
  ]
  for (const pat of patterns) {
    const match = pat.exec(fileContent)
    if (match?.[1]) {
      const raw = match[1].replace(jsdocStarPat, '').replace(leadingWsPat, '').replace(trailingWsPat, '')
      if (raw) return raw
    }
  }
  return ''
}
const extractSignature = (fileContent: string, symbolName: string): string => {
  const escaped = symbolName.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)
  const constPat = new RegExp(`const\\s+${escaped}\\s*(?::\\s*([^=]+))?=\\s*(.+)`, 'u')
  const constMatch = constPat.exec(fileContent)
  /** biome-ignore lint/nursery/noUnnecessaryConditions: exec returns null */
  if (constMatch) {
    const annotation = constMatch[1]?.trim()
    if (annotation) return annotation
    const rhs = constMatch[2]?.trim() ?? ''
    const arrowIdx = rhs.indexOf('=>')
    if (arrowIdx > 0) {
      const params = rhs.slice(0, arrowIdx).trim()
      if (params.startsWith('(')) return `${params} => ...`
    }
  }
  const ifacePat = new RegExp(`interface\\s+${escaped}\\s*\\{([^}]*)\\}`, 'u')
  const ifaceMatch = ifacePat.exec(fileContent)
  if (ifaceMatch?.[1]) {
    const keys: string[] = []
    const fieldPat = /^\s*(?<field>\w+)\s*[:(]/gmu
    let fm = fieldPat.exec(ifaceMatch[1])
    while (fm) {
      if (fm.groups?.field) keys.push(fm.groups.field)
      fm = fieldPat.exec(ifaceMatch[1])
    }
    if (keys.length > 0) return `{ ${keys.join(', ')} }`
  }
  return ''
}
const processEntryPoint = (ep: { label: string; path: string }, srcDir: string, lines: string[]): number => {
  const indexPath = join(srcDir, ep.path)
  if (!existsSync(indexPath)) return 0
  const indexContent = readFileSync(indexPath, 'utf8')
  const reExports = resolveReExports(indexContent)
  if (reExports.length === 0) return 0
  lines.push(`## ${ep.label}`, '')
  lines.push('| Export | Kind | Description | Signature |')
  lines.push('|--------|------|-------------|-----------|')
  let count = 0
  for (const re of reExports) {
    const sourceFile = join(dirname(indexPath), `${re.sourcePath.replace(tsExtPat, '')}.ts`)
    let doc = ''
    let sig = ''
    if (existsSync(sourceFile)) {
      const src = readFileSync(sourceFile, 'utf8')
      doc = extractJSDoc(src, re.symbol)
      sig = extractSignature(src, re.symbol)
    }
    if (!doc) doc = extractJSDoc(indexContent, re.symbol)
    if (!sig) sig = extractSignature(indexContent, re.symbol)
    const kind = re.isType ? 'type' : re.isDefault ? 'default' : 'named'
    lines.push(`| \`${re.symbol}\` | ${kind} | ${doc} | ${sig ? `\`${sig}\`` : ''} |`)
    count += 1
  }
  lines.push('')
  return count
}
export { extractJSDoc, extractSignature, green, processEntryPoint, resolveReExports }
