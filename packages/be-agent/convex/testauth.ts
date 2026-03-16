import { getAuthUserId } from '@convex-dev/auth/server'
import { makeTestAuth } from '@noboil/convex/test'

import { mutation, query } from './_generated/server'

const testAuth = makeTestAuth({
    getAuthUserId: getAuthUserId as (ctx: unknown) => Promise<null | string>,
    mutation,
    query
  }),
  { createTestUser, ensureTestUser, getAuthUserIdOrTest, isTestMode, TEST_EMAIL } = testAuth,
  signInAsTestUser = mutation({
    args: {},
    handler: async ctx => {
      if (!isTestMode()) throw new Error('test_mode_only')
      const existing = ctx.db
        .query('users')
        .filter(q => q.eq(q.field('email'), TEST_EMAIL))
        .first()
      if (existing) return { userId: existing._id }
      const userId = await ctx.db.insert('users', {
        email: TEST_EMAIL,
        emailVerificationTime: Date.now(),
        name: 'Test User'
      })
      return { userId }
    }
  })

export { createTestUser, ensureTestUser, getAuthUserIdOrTest, isTestMode, signInAsTestUser, TEST_EMAIL }
