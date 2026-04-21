import { run } from './utils'
await run('bun --filter @noboil/convex test', { quiet: false })
await run('bun --filter @noboil/spacetimedb test', { quiet: false })
await run('bun --filter @a/be-convex test:integration', { quiet: false })
