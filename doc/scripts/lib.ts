/* eslint-disable no-console, @typescript-eslint/max-params */
/* oxlint-disable max-params */
/** biome-ignore-all lint/complexity/useMaxParams: internal helper */
import { readFileSync, writeFileSync } from 'node:fs'
const BLANK_AFTER_START_RE = /^\n\s*\n/u
const BLANK_BEFORE_END_RE = /\n\s*\n$/u
const isCheck = (): boolean => process.argv.includes('--check')
const splice = (mdx: string, startIdx: number, startTagLen: number, endIdx: number, body: string): string => {
  const before = mdx.slice(0, startIdx + startTagLen)
  const prevBetween = mdx.slice(startIdx + startTagLen, endIdx)
  const hadBlankAfterStart = BLANK_AFTER_START_RE.test(prevBetween)
  const hadBlankBeforeEnd = BLANK_BEFORE_END_RE.test(prevBetween)
  const after = mdx.slice(endIdx)
  const lead = hadBlankAfterStart ? '\n\n' : '\n'
  const trail = hadBlankBeforeEnd ? '\n\n' : '\n'
  return `${before}${lead}${body}${trail}${after.startsWith('\n') ? after.slice(1) : after}`
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
export { isCheck, replaceBetween, replaceLineBetween }
