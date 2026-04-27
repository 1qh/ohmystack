#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/performance/useTopLevelRegex: per-file scan */
/** biome-ignore-all lint/nursery/noContinue: parser */
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
interface Spec {
  brand: string
  expectedOpts: string[]
  factoryFile: string
  intentionalCvxOnly?: Record<string, string>
  intentionalStdbOnly?: Record<string, string>
}
const SPECS: Spec[] = [
  {
    brand: 'base',
    expectedOpts: ['fetcher', 'ttl', 'staleWhileRevalidate', 'hooks', 'key'],
    factoryFile: 'cache-crud.ts',
    intentionalStdbOnly: {
      fetcher: 'stdb cache fills client-side via reducers; server has no HTTP capability',
      hooks: 'stdb base uses table subscriptions; lifecycle hooks go on the wrapping reducer',
      staleWhileRevalidate: 'no server-side refresh in stdb model; SWR managed by client useCacheEntry'
    }
  },
  {
    brand: 'child',
    expectedOpts: ['cascade', 'softDelete', 'rateLimit', 'hooks', 'pub'],
    factoryFile: 'child.ts',
    intentionalCvxOnly: {
      cascade: 'configured on parent table, not child — symmetric with stdb',
      rateLimit: 'shared with owned/orgScoped factories, not redeclared in child.ts',
      softDelete: 'shared rule from CrudOptions, not redeclared in child.ts'
    },
    intentionalStdbOnly: {
      cascade: 'configured on parent table, not child — symmetric with cvx',
      pub: 'stdb uses subscription-based reads — pub-style filtering happens via subscription where clauses, not on child factory'
    }
  },
  {
    brand: 'kv',
    expectedOpts: ['writeRole', 'softDelete', 'rateLimit', 'hooks'],
    factoryFile: 'kv.ts',
    intentionalStdbOnly: { keys: 'stdb kv uses constant string keys without runtime whitelist (typed via TS only)' }
  },
  {
    brand: 'log',
    expectedOpts: ['softDelete', 'rateLimit', 'hooks'],
    factoryFile: 'log.ts',
    intentionalStdbOnly: {
      pub: 'stdb log uses subscription where clauses for visibility scoping',
      search: 'stdb log searches client-side over subscribed rows',
      withAuthor: 'stdb subscriptions return row data only; author lookup is a separate client-side join'
    }
  },
  {
    brand: 'orgScoped',
    expectedOpts: ['acl', 'cascade', 'softDelete', 'rateLimit', 'hooks'],
    factoryFile: 'org-crud.ts',
    intentionalCvxOnly: {},
    intentionalStdbOnly: {
      aclFrom:
        'stdb checks aclFrom in client-side query layer (subscription is owner-checked at the row, parent-derived ACL applied client-side)',
      unique: 'stdb declares unique constraints via column attributes in module bindings, not via factory option'
    }
  },
  {
    brand: 'owned',
    expectedOpts: ['softDelete', 'rateLimit', 'cascade', 'hooks'],
    factoryFile: 'crud.ts',
    intentionalCvxOnly: { acl: 'owned tables in cvx may opt into ACL; stdb keeps ACL strictly within orgScoped factory' },
    intentionalStdbOnly: {
      pub: 'stdb uses subscription where clauses for visibility scoping (no separate pub option needed)',
      search: 'stdb owned searches client-side over subscribed rows'
    }
  },
  { brand: 'quota', expectedOpts: ['hooks', 'limit', 'durationMs'], factoryFile: 'quota.ts' },
  {
    brand: 'singleton',
    expectedOpts: ['hooks', 'rateLimit'],
    factoryFile: 'singleton.ts',
    intentionalCvxOnly: { hooks: 'cvx singletonCrud lifecycle hooks delegated to underlying mutation builder' },
    intentionalStdbOnly: {
      rateLimit: 'stdb singleton has at most one row per user — rate-limit pressure is naturally bounded'
    }
  }
]
const fileExists = (path: string): boolean => statSync(path, { throwIfNoEntry: false }) !== undefined
const optReferenced = (root: string, file: string, opt: string): boolean => {
  const path = `${root}/${file}`
  if (!fileExists(path)) return false
  const src = readFileSync(path, 'utf8')
  return new RegExp(`\\b${opt}\\b`, 'u').test(src)
}
const main = () => {
  const cvxRoot = `${REPO}/lib/noboil/src/convex/server`
  const stdbRoot = `${REPO}/lib/noboil/src/spacetimedb/server`
  const rows: string[] = []
  let totalCvxMissing = 0
  let totalStdbMissing = 0
  let totalChecked = 0
  const intentionalNotes: string[] = []
  for (const spec of SPECS) {
    const cvxMissing: string[] = []
    const stdbMissing: string[] = []
    const cvxHas: string[] = []
    const stdbHas: string[] = []
    for (const opt of spec.expectedOpts) {
      totalChecked += 1
      const c = optReferenced(cvxRoot, spec.factoryFile, opt)
      const s = optReferenced(stdbRoot, spec.factoryFile, opt)
      if (c) cvxHas.push(opt)
      else {
        cvxMissing.push(opt)
        totalCvxMissing += 1
      }
      if (s) stdbHas.push(opt)
      else {
        stdbMissing.push(opt)
        totalStdbMissing += 1
      }
    }
    const cvxIntentional = Object.keys(spec.intentionalCvxOnly ?? {})
    const stdbIntentional = Object.keys(spec.intentionalStdbOnly ?? {})
    const cvxRealMissing = cvxMissing.filter(o => !cvxIntentional.includes(o))
    const stdbRealMissing = stdbMissing.filter(o => !stdbIntentional.includes(o))
    const status = cvxRealMissing.length === 0 && stdbRealMissing.length === 0 ? '🟢' : '🔴'
    rows.push(
      `| \`${spec.brand}\` | ${cvxHas.length}/${spec.expectedOpts.length} | ${stdbHas.length}/${spec.expectedOpts.length} | ${cvxIntentional.length + stdbIntentional.length} | ${status} | ${cvxRealMissing.length === 0 ? '—' : cvxRealMissing.map(o => `\`${o}\``).join(', ')} | ${stdbRealMissing.length === 0 ? '—' : stdbRealMissing.map(o => `\`${o}\``).join(', ')} |`
    )
    for (const [opt, reason] of Object.entries(spec.intentionalCvxOnly ?? {}))
      intentionalNotes.push(`- **\`${spec.brand}.${opt}\`** (cvx-only): ${reason}`)
    for (const [opt, reason] of Object.entries(spec.intentionalStdbOnly ?? {}))
      intentionalNotes.push(`- **\`${spec.brand}.${opt}\`** (stdb-only): ${reason}`)
  }
  const body = [
    `Per-factory option parity. For each factory, checks every expected option is textually referenced in both backends' factory file. The "intentional" column documents architecturally-justified backend-specific options (with rationale below).`,
    '',
    `**${totalChecked * 2 - totalCvxMissing - totalStdbMissing}/${totalChecked * 2} option × backend cells satisfied. After intentional exemptions: 🟢 = no unaccounted-for gaps.**`,
    '',
    '| Factory | cvx coverage | stdb coverage | intentional asym | status | cvx unaccounted | stdb unaccounted |',
    '|---|--:|--:|--:|--|---|---|',
    ...rows,
    '',
    '### Architectural backend-specific options (intentional)',
    '',
    'Options that exist on one backend but not the other because the underlying database has a different runtime model:',
    '',
    ...intentionalNotes
  ].join('\n')
  const target = `${REPO}/doc/content/docs/architecture.mdx`
  const dirty = replaceBetween(target, 'OPTION-PARITY', body)
  if (dirty) console.log(`Updated option parity (cvx-missing: ${totalCvxMissing}, stdb-missing: ${totalStdbMissing})`)
}
main()
