import type { Id, TableNames } from '@a/be-convex/model'

import { getErrorMessage, handleConvexError } from '@ohmystack/convex/server'
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
  isId = <T extends TableNames>(val: unknown): val is Id<T> => typeof val === 'string' && val.length > 0,
  formatDate = (ts: number) => new Date(ts).toLocaleDateString(),
  formatExpiry = (expiresAt: number) => {
    const days = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24))
    if (days <= 0) return 'Expired'
    if (days === 1) return '1 day left'
    return `${days} days left`
  }

export { fail, formatDate, formatExpiry, isId }
