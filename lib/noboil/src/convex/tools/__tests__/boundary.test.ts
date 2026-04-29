import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
const LIB = resolve(import.meta.dirname, '..')
const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full)
  }
  return out
}
const FORBIDDEN_IMPORTS = [/from '\.\.\/[a-z][a-zA-Z]*\//u]
const FORBIDDEN_TOKENS = ['exim', 'macmap', 'tariff', 'hscode', 'typesense', 'anthropic', 'gemini', 'serper']
const FORBIDDEN_TOKEN_RES = FORBIDDEN_TOKENS.map(t => ({ re: new RegExp(`\\b${t}\\b`, 'iu'), token: t }))
describe('framework boundary — tools/ imports nothing project-specific', () => {
  const files = walk(LIB).filter(f => statSync(f).isFile())
  for (const file of files)
    it(`${file.replace(LIB, 'tools')} has no project-side imports`, () => {
      const src = readFileSync(file, 'utf8')
      for (const pat of FORBIDDEN_IMPORTS)
        expect(
          pat.test(src),
          `${file.replace(LIB, 'tools')} imports from project scope (matched ${pat.source})`
        ).toBeFalsy()
    })
  for (const file of files)
    it(`${file.replace(LIB, 'tools')} contains no consumer-domain tokens`, () => {
      const src = readFileSync(file, 'utf8')
      for (const { re, token } of FORBIDDEN_TOKEN_RES)
        expect(re.test(src), `${file.replace(LIB, 'tools')} references '${token}'`).toBeFalsy()
    })
})
