/* oxlint-disable eslint/no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential slug checks */
/* eslint-disable no-await-in-loop */
/* oxlint-disable no-underscore-dangle -- Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
/* oxlint-disable eslint(no-underscore-dangle) */
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
} = orgFns
const slugTaken = async (ctx: MutationCtx, slug: string) =>
  ctx.db
    .query('org')
    .withIndex('by_slug', o => o.eq('slug', slug))
    .unique()
const MAX_SLUG_ATTEMPTS = 100
const findUniqueSlug = async (ctx: MutationCtx, base: string): Promise<string> => {
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${String(attempt)}`
    if (!(await slugTaken(ctx, candidate))) return candidate
  }
  throw new ConvexError({ code: 'SLUG_GENERATION_FAILED' })
}
const getOrCreate = mutation({
  args: {},
  handler: async ctx => {
    const uid = await getAuthUserIdOrTest(ctx)
    if (!uid) throw new ConvexError({ code: 'NOT_AUTHENTICATED' })
    const user: null | Record<string, unknown> = await ctx.db.get(uid as never)
    if (!user) throw new ConvexError({ code: 'USER_NOT_FOUND' })
    const existing = await Promise.resolve(
      ctx.db
        .query('org')
        .withIndex('by_user', o => o.eq('userId', uid as never))
        .first()
    )
    if (existing) return { created: false, orgId: existing._id }
    const userName = typeof user.name === 'string' ? user.name : undefined
    const userEmail = typeof user.email === 'string' ? user.email : undefined
    const name = userName ?? userEmail ?? 'User'
    const baseName = `${name}'s Organization`
    const baseSlug = name
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, '-')
      .replaceAll(/^-|-$/gu, '')
    const finalSlug = await findUniqueSlug(ctx, `${baseSlug}-org`)
    const orgId = await ctx.db.insert('org', {
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
