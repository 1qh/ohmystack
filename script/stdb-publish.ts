import { config } from '@a/config'
import { run } from './utils'
const args = process.argv.slice(2).join(' ')
await run(
  `bash -lc 'PATH="$HOME/.local/bin:$PATH" spacetime publish ${config.module} --module-path ${config.paths.backendStdb} ${args}'`,
  { quiet: false }
)
