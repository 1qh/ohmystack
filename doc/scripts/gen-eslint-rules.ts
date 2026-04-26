#!/usr/bin/env bun
/* eslint-disable no-console */
import { resolve } from 'node:path'
import { rules as cvxRules } from '../../lib/noboil/src/convex/eslint'
import { rules as stdbRules } from '../../lib/noboil/src/spacetimedb/eslint'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const escapeMd = (s: string): string =>
  s
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', String.raw`\|`)
    .replaceAll('{', String.raw`\{`)
    .replaceAll('}', String.raw`\}`)
    .replaceAll('\n', ' ')
const firstMessage = (rule: { meta: { messages: Record<string, string> } }): string => {
  const msgs = Object.values(rule.meta.messages)
  return msgs[0] ?? ''
}
const main = () => {
  const cvxNames = Object.keys(cvxRules).toSorted()
  const stdbNames = Object.keys(stdbRules).toSorted()
  const all = [...new Set([...cvxNames, ...stdbNames])].toSorted()
  const rows = all.map(name => {
    const inCvx = cvxNames.includes(name)
    const inStdb = stdbNames.includes(name)
    const rule =
      (cvxRules as Record<string, { meta: { messages: Record<string, string> } }>)[name] ??
      (stdbRules as Record<string, { meta: { messages: Record<string, string> } }>)[name]
    const desc = rule ? escapeMd(firstMessage(rule)) : ''
    return `| \`${name}\` | ${inCvx ? '✓' : '—'} | ${inStdb ? '✓' : '—'} | ${desc} |`
  })
  const body = ['| Rule | Convex | SpacetimeDB | Message |', '|---|---|---|---|', ...rows].join('\n')
  const target = `${REPO}/doc/content/docs/api-reference.mdx`
  const dirty = replaceBetween(target, 'ESLINT-RULES', body)
  console.log(
    dirty
      ? `Updated ESLint rules table (cvx:${cvxNames.length}, stdb:${stdbNames.length}, total:${all.length})`
      : `ESLint rules table up to date (cvx:${cvxNames.length}, stdb:${stdbNames.length}, total:${all.length})`
  )
}
main()
