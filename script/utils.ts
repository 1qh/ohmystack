import { $ } from 'bun'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const root = join(import.meta.dirname, '..')
const envPath = join(root, '.env')
const log = (msg: string) => process.stdout.write(`${msg}\n`)
const run = async (cmd: string) => {
  log(`> ${cmd}`)
  const result = await $`bash -c ${cmd}`.cwd(root).quiet()
  if (result.exitCode !== 0) {
    process.stderr.write(result.stderr.toString())
    throw new Error(`Command failed: ${cmd}`)
  }
  return result.stdout.toString().trim()
}
const readEnv = (): Record<string, string> => {
  const current: Record<string, string> = {}
  if (existsSync(envPath))
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) current[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
      }
    }
  return current
}
const patchEnv = (entries: [string, string][]) => {
  const current = readEnv()
  for (const [k, v] of entries) current[k] = v
  writeFileSync(
    envPath,
    `${Object.entries(current)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')}\n`
  )
}
const generateJwtKeys = async () => {
  const { subtle } = globalThis.crypto
  const keyPair = await subtle.generateKey(
    { hash: 'SHA-256', modulusLength: 2048, name: 'RSASSA-PKCS1-v1_5', publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['sign', 'verify']
  )
  const pkcs8 = await subtle.exportKey('pkcs8', keyPair.privateKey)
  const b64 = Buffer.from(pkcs8).toString('base64')
  const pem = `-----BEGIN PRIVATE KEY-----\n${(b64.match(/.{1,64}/gu) ?? []).join('\n')}\n-----END PRIVATE KEY-----`
  const jwk = await subtle.exportKey('jwk', keyPair.publicKey)
  const jwks = JSON.stringify({ keys: [{ use: 'sig', ...jwk }] })
  return { jwks, pem }
}
export { envPath, generateJwtKeys, log, patchEnv, readEnv, root, run }
