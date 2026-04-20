import { config } from '../noboil.config'
import { run } from './utils'
await run('bun --cwd lib/convex test', { quiet: false })
await run('bun --cwd lib/spacetimedb test', { quiet: false })
await run(
  `cd ${config.paths.backendConvex} && CONVEX_TEST_MODE=true nb-env bun test convex/f.test.ts convex/org-api.test.ts convex/edge.test.ts`,
  { quiet: false }
)
