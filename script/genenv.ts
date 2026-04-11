import { env } from 'bun'
import { log } from 'node:console'
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
log(`TMDB_KEY=${env.TMDB_KEY}`)
log(`AUTH_GOOGLE_ID=${env.AUTH_GOOGLE_ID}`)
log(`AUTH_GOOGLE_SECRET=${env.AUTH_GOOGLE_SECRET}`)
log('SITE_URL=http://localhost:4100')
log(`JWT_PRIVATE_KEY="${pem.trimEnd().replaceAll('\n', ' ')}"`)
log(`JWKS=${JSON.stringify({ keys: [{ use: 'sig', ...jwk }] })}`)
