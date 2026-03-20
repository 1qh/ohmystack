import { env } from 'bun'
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose'
import { log } from 'node:console'
log(`TMDB_KEY=${env.TMDB_KEY}`)
log(`AUTH_GOOGLE_ID=${env.AUTH_GOOGLE_ID}`)
log(`AUTH_GOOGLE_SECRET=${env.AUTH_GOOGLE_SECRET}`)
log('SITE_URL=http://localhost:3000')
const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true }),
  privateK = await exportPKCS8(privateKey),
  publicK = await exportJWK(publicKey)
log(`JWT_PRIVATE_KEY="${privateK.trimEnd().replaceAll('\n', ' ')}"`)
log(`JWKS=${JSON.stringify({ keys: [{ use: 'sig', ...publicK }] })}`)
