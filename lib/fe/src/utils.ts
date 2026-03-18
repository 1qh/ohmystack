import type { Id, TableNames } from '@a/be-convex/model'

import { getErrorMessage, handleConvexError } from '@noboil/convex/server'
import { toast } from 'sonner'

const fail = (error: unknown) => {
    handleConvexError(error, {
      default: () => {
        toast.error(getErrorMessage(error))
      },
      NOT_AUTHENTICATED: () => {
        toast.error('Please log in')
      },
      RATE_LIMITED: () => {
        toast.error('Too many requests, try again later')
      }
    })
  },
  parseId = (val: unknown): null | number => {
    if (typeof val === 'number' && val > 0) return val
    if (typeof val === 'string') {
      const n = Number(val)
      if (Number.isFinite(n) && n > 0) return n
    }
    return null
  },
  isId = <T extends TableNames>(val: unknown): val is Id<T> => typeof val === 'string' && val.length > 0,
  formatDate = (ts: number) => new Date(ts).toLocaleDateString(),
  formatExpiry = (expiresAt: number) => {
    const days = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24))
    if (days <= 0) return 'Expired'
    if (days === 1) return '1 day left'
    return `${days} days left`
  },
  toIdentityKey = (value: unknown) => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return `${value}`
    if (typeof value !== 'object' || !('toHexString' in value)) return ''
    const candidate = value as { toHexString?: () => string }
    if (typeof candidate.toHexString === 'function') return candidate.toHexString()
    return ''
  },
  sameIdentity = (a: { toHexString: () => string }, b: { toHexString: () => string }) =>
    a.toHexString() === b.toHexString(),
  withStringId = <T extends { id: number }>(item: T): T & { _id: string } => ({
    ...item,
    _id: `${item.id}`
  })

export { fail, formatDate, formatExpiry, isId, parseId, sameIdentity, toIdentityKey, withStringId }
