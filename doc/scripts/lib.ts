/* eslint-disable no-console, @typescript-eslint/max-params, no-continue, @typescript-eslint/no-unnecessary-condition */
/* oxlint-disable max-params */
/** biome-ignore-all lint/complexity/useMaxParams: internal helper */
/** biome-ignore-all lint/nursery/noContinue: parser */
import { readFileSync, writeFileSync } from 'node:fs'
const BLANK_AFTER_START_RE = /^\n\s*\n/u
const BLANK_BEFORE_END_RE = /\n\s*\n$/u
const TABLE_SEP_RE = /^\|[\s|:-]*-{3,}[\s|:-]*\|$/u
const TABLE_SEP_CELL_RE = /^:?-+:?$/u
const isCheck = (): boolean => process.argv.includes('--check')
const padMarkdownTables = (text: string): string => {
  const lines = text.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const sepLine = lines[i + 1]?.trim() ?? ''
    if (!(line.trim().startsWith('|') && TABLE_SEP_RE.test(sepLine))) {
      out.push(line)
      i += 1
      continue
    }
    let j = i
    const block: string[][] = []
    while (j < lines.length && lines[j]?.trim().startsWith('|')) {
      const cells = (lines[j] ?? '')
        .trim()
        .slice(1, -1)
        .split('|')
        .map(c => c.trim())
      block.push(cells)
      j += 1
    }
    const widths: number[] = []
    for (const row of block)
      for (const [k, cell] of row.entries()) {
        const w = (cell ?? '').length
        if ((widths[k] ?? 0) < w) widths[k] = w
      }
    for (const row of block) {
      const isSep = row.every(c => TABLE_SEP_CELL_RE.test(c))
      const padded = row.map((c, k) => {
        const w = widths[k] ?? c.length
        if (isSep) {
          if (c.startsWith(':') && c.endsWith(':')) return `:${'-'.repeat(Math.max(1, w - 2))}:`
          if (c.endsWith(':')) return `${'-'.repeat(Math.max(1, w - 1))}:`
          return '-'.repeat(Math.max(3, w))
        }
        return c.padEnd(w)
      })
      out.push(`| ${padded.join(' | ')} |`)
    }
    i = j
  }
  return out.join('\n')
}
const splice = (mdx: string, startIdx: number, startTagLen: number, endIdx: number, body: string): string => {
  const before = mdx.slice(0, startIdx + startTagLen)
  const prevBetween = mdx.slice(startIdx + startTagLen, endIdx)
  const hadBlankAfterStart = BLANK_AFTER_START_RE.test(prevBetween)
  const hadBlankBeforeEnd = BLANK_BEFORE_END_RE.test(prevBetween)
  const after = mdx.slice(endIdx)
  const lead = hadBlankAfterStart ? '\n\n' : '\n'
  const trail = hadBlankBeforeEnd ? '\n\n' : '\n'
  const paddedBody = padMarkdownTables(body)
  return `${before}${lead}${paddedBody}${trail}${after.startsWith('\n') ? after.slice(1) : after}`
}
const replaceBetween = (path: string, name: string, body: string): boolean => {
  const start = `{/* AUTO-GENERATED:${name}:START */}`
  const end = `{/* AUTO-GENERATED:${name}:END */}`
  const mdx = readFileSync(path, 'utf8')
  const startIdx = mdx.indexOf(start)
  const endIdx = mdx.indexOf(end)
  if (startIdx === -1 || endIdx === -1) {
    console.error(`Missing markers ${name} in ${path}. Add:\n${start}\n${end}`)
    return false
  }
  const next = splice(mdx, startIdx, start.length, endIdx, body)
  if (next === mdx) return false
  if (isCheck()) return true
  writeFileSync(path, next)
  return true
}
const replaceLineBetween = (path: string, name: string, body: string): boolean => {
  const tag = `<!-- AUTO-GENERATED:${name} -->`
  const endTag = `<!-- /AUTO-GENERATED:${name} -->`
  const mdx = readFileSync(path, 'utf8')
  const startIdx = mdx.indexOf(tag)
  const endIdx = mdx.indexOf(endTag)
  if (startIdx === -1 || endIdx === -1) {
    console.error(`Missing tags ${tag}/${endTag} in ${path}.`)
    return false
  }
  const next = splice(mdx, startIdx, tag.length, endIdx, body)
  if (next === mdx) return false
  if (isCheck()) return true
  writeFileSync(path, next)
  return true
}
export { isCheck, padMarkdownTables, replaceBetween, replaceLineBetween }
