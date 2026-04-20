import { config } from '../noboil.config'
import { run } from './utils'
await run(
  `bash -lc 'PATH="$HOME/.local/bin:$PATH" spacetime generate --lang typescript --out-dir ${config.paths.stdbGenerated} --module-path ${config.paths.backendStdb}'`,
  { quiet: false }
)
