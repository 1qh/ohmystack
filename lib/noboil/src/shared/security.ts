/* eslint-disable no-bitwise */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: constantTimeEqual requires bitwise OR/XOR */
const constantTimeEqual = (a: string, b: string): boolean => {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  const len = Math.max(ab.length, bb.length)
  let result = ab.length ^ bb.length
  for (let i = 0; i < len; i += 1) result |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return result === 0
}
const hashSecret = async (secret: string): Promise<string> => {
  const bytes = new TextEncoder().encode(secret)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}
const generateSecret = (): string => crypto.randomUUID()
export { constantTimeEqual, generateSecret, hashSecret }
