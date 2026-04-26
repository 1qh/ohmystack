#!/usr/bin/env bun
/* eslint-disable no-console */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const extractInterface = (file: string, name: string): null | string => {
  const src = readFileSync(file, 'utf8')
  const re = new RegExp(`interface ${name}(?:<[^>]*>)?\\s*\\{([^}]+)\\}`, 'u')
  const m = re.exec(src)
  return m?.[1] ? m[1].trim() : null
}
const formatInterface = (body: string): string =>
  body
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => `  ${l}`)
    .join('\n')
const block = (label: string, body: string) => `### ${label}\n\n\`\`\`ts\n{\n${formatInterface(body)}\n}\n\`\`\``
const buildSection = (kind: 'convex' | 'spacetimedb'): string => {
  const dir = `${REPO}/lib/noboil/src/${kind}/react`
  const log = extractInterface(`${dir}/use-log.ts`, 'LogHookResult')
  const kv = extractInterface(`${dir}/use-kv.ts`, 'KvHookResult')
  const quota = extractInterface(`${dir}/use-quota.ts`, 'QuotaHookResult')
  const sections: string[] = []
  if (log) sections.push(block(`useLog (${kind})`, log))
  if (kv) sections.push(block(`useKv (${kind})`, kv))
  if (quota) sections.push(block(`useQuota (${kind})`, quota))
  return sections.join('\n\n')
}
const main = () => {
  const body = `${buildSection('convex')}\n\n${buildSection('spacetimedb')}`
  const target = `${REPO}/doc/content/docs/api-reference.mdx`
  const dirty = replaceBetween(target, 'HOOK-INTERFACES', body)
  console.log(dirty ? 'Updated hook interfaces' : 'Hook interfaces up to date')
}
main()
