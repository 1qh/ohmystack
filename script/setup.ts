import { c, log, parseArgs, run } from './utils'
const flags = parseArgs(process.argv.slice(2))
const doConvex = flags.has('convex') || !(flags.has('convex') || flags.has('stdb'))
const doStdb = flags.has('stdb') || !(flags.has('convex') || flags.has('stdb'))
const passthru = [...flags]
  .filter(f => !['convex', 'stdb'].includes(f))
  .map(f => `--${f}`)
  .join(' ')
log(c.bold(`noboil setup → ${[doConvex && 'Convex', doStdb && 'SpacetimeDB'].filter(Boolean).join(' + ')}`))
if (doConvex) await run(`bun script/setup-convex.ts ${passthru}`, { quiet: false })
if (doStdb) await run(`bun script/setup-spacetimedb.ts ${passthru}`, { quiet: false })
