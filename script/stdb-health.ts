/* oxlint-disable no-process-exit */
import { config } from '../noboil.config'
const r = await fetch(`http://localhost:${config.ports.stdb}/v1/ping`).catch(() => null)
if (!r?.ok) {
  process.stderr.write('SpacetimeDB not healthy\n')
  process.exit(1)
}
process.stdout.write('SpacetimeDB is healthy\n')
