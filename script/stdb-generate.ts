import { config } from '@a/config'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { root, run } from './utils'
const sdkPath = join(root, 'node_modules', 'spacetimedb', 'dist', 'server', 'index.mjs')
const backupPath = `${sdkPath}.orig`
const patchedContent = existsSync(sdkPath) ? readFileSync(sdkPath, 'utf8') : ''
const wasPatched = patchedContent.includes('/* patched: stdb-sys-stub */')
if (wasPatched && existsSync(backupPath)) copyFileSync(backupPath, sdkPath)
try {
  await run(
    `bash -lc 'PATH="${root}/node_modules/.bin:$HOME/.local/bin:$PATH" spacetime generate --lang typescript --out-dir ${config.paths.backendStdb}/module_bindings --module-path ${config.paths.backendStdb}'`,
    { quiet: false }
  )
} finally {
  if (wasPatched) writeFileSync(sdkPath, patchedContent)
}
