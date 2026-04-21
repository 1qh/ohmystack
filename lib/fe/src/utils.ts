/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
/** biome-ignore-all lint/nursery/noComponentHookFactories: factory returns hook by design */
import { getErrorMessage } from 'noboil/server'
import { toast } from 'sonner'
const fail = (error: unknown) => {
  const msg = getErrorMessage(error)
  if (msg.includes('NOT_AUTHENTICATED')) toast.error('Please log in')
  else if (msg.includes('RATE_LIMITED')) toast.error('Too many requests, try again later')
  else toast.error(msg)
}
const parseId = (val: unknown): null | number => {
  if (typeof val === 'number' && val > 0) return val
  if (typeof val === 'string') {
    const n = Number(val)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}
const isId = <T extends string = string>(val: unknown): val is T => typeof val === 'string' && val.length > 0
const formatDate = (ts: number) => new Date(ts).toLocaleDateString()
const formatExpiry = (expiresAt: number) => {
  const days = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'Expired'
  if (days === 1) return '1 day left'
  return `${days} days left`
}
const toIdentityKey = (value: unknown) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return `${value}`
  if (typeof value !== 'object' || !('toHexString' in value)) return ''
  const candidate = value as { toHexString?: () => string }
  if (typeof candidate.toHexString === 'function') return candidate.toHexString()
  return ''
}
const sameIdentity = (a: { toHexString: () => string }, b: { toHexString: () => string }) =>
  a.toHexString() === b.toHexString()
const withStringId = <T extends { id: number }>(item: T): T & { _id: string } => ({
  ...item,
  _id: `${item.id}`
})
export { fail, formatDate, formatExpiry, isId, parseId, sameIdentity, toIdentityKey, withStringId }
