#!/usr/bin/env bun
/* eslint-disable no-console, prefer-named-capture-group, @typescript-eslint/no-non-null-assertion */
/** biome-ignore-all lint/style/noNonNullAssertion: matchAll groups */
/** biome-ignore-all lint/nursery/useNamedCaptureGroup: simple match */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceLineBetween } from './lib'
const REPO = resolve(import.meta.dir, '../..')
const TYPE_RE = /type TableType = (?<types>(?:'\w+'(?:\s*\|\s*)?)+)/u
const main = () => {
  const cvxAdd = readFileSync(`${REPO}/lib/noboil/src/convex/add.ts`, 'utf8')
  const m = TYPE_RE.exec(cvxAdd)
  if (!m?.groups?.types) throw new Error('TableType union not found in convex/add.ts')
  const types = [...m.groups.types.matchAll(/'(\w+)'/gu)].map(t => t[1]!)
  const sample = types.includes('owned') ? 'owned' : (types[0] ?? 'owned')
  const list = types.join(', ')
  const example = `\`noboil add post --type=${sample} --fields="title:string,content:string"\``
  const target = `${REPO}/README.md`
  const tagline = `\`noboil init my-app --db=convex\`, ${example}, etc. (Valid \`--type=\` values: ${list}.) Run \`noboil <cmd> --help\` for options.`
  const dirty = replaceLineBetween(target, 'CLI-TABLE-TYPES', tagline)
  console.log(dirty ? `Updated CLI table types: ${list}` : 'CLI table types up to date')
}
main()
