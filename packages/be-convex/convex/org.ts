import { ConvexError } from 'convex/values'

import type { MutationCtx } from './_generated/server'

import { orgFns } from '../lazy'
import { mutation } from './_generated/server'
import { getAuthUserIdOrTest } from './testauth'

const {
    acceptInvite,
    approveJoinRequest,
    cancelJoinRequest,
    create,
    get,
    getBySlug,
    getPublic,
    invite,
    isSlugAvailable,
    leave,
    members,
    membership,
    myJoinRequest,
    myOrgs,
    pendingInvites,
    pendingJoinRequests,
    rejectJoinRequest,
    remove,
    removeMember,
    requestJoin,
    revokeInvite,
    setAdmin,
    transferOwnership,
    update
  } = orgFns,
  slugTaken = async (ctx: MutationCtx, slug: string) =>
    ctx.db
      .query('org')
      .withIndex('by_slug', o => o.eq('slug', slug))
      .unique(),
  findUniqueSlug = async (ctx: MutationCtx, base: string) => {
    let candidate = base,
      attempt = 0
    // oxlint-disable-next-line no-await-in-loop
    /** biome-ignore lint/performance/noAwaitInLoops: sequential slug check */
    while (await slugTaken(ctx, candidate)) {
      attempt += 1
      candidate = `${base}-${String(attempt)}`
    }
    return candidate
  },
  getOrCreate = mutation({
    args: {},
    handler: async ctx => {
      const uid = await getAuthUserIdOrTest(ctx)
      if (!uid) throw new ConvexError({ code: 'NOT_AUTHENTICATED' })
      const user = await ctx.db.get(uid as never)
      if (!user) throw new ConvexError({ code: 'USER_NOT_FOUND' })
      const existing = await Promise.resolve(
        ctx.db
          .query('org')
          .withIndex('by_user', o => o.eq('userId', uid as never))
          .first()
      )
      if (existing) return { created: false, orgId: existing._id }
      const name =
          (user as unknown as { email?: string; name?: string }).name ??
          (user as unknown as { email?: string; name?: string }).email ??
          'User',
        baseName = `${name}'s Organization`,
        baseSlug = name
          .toLowerCase()
          .replaceAll(/[^a-z0-9]+/gu, '-')
          .replaceAll(/^-|-$/gu, ''),
        finalSlug = await findUniqueSlug(ctx, `${baseSlug}-org`),
        orgId = await ctx.db.insert('org', {
          name: baseName,
          slug: finalSlug,
          updatedAt: Date.now(),
          userId: uid as never
        })
      return { created: true, orgId }
    }
  })

export {
  acceptInvite,
  approveJoinRequest,
  cancelJoinRequest,
  create,
  get,
  getBySlug,
  getOrCreate,
  getPublic,
  invite,
  isSlugAvailable,
  leave,
  members,
  membership,
  myJoinRequest,
  myOrgs,
  pendingInvites,
  pendingJoinRequests,
  rejectJoinRequest,
  remove,
  removeMember,
  requestJoin,
  revokeInvite,
  setAdmin,
  transferOwnership,
  update
}
