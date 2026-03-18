import type { GenericId } from 'convex/values'

import { zid } from 'convex-helpers/server/zod4'
import { z } from 'zod/v4'

import type { DbLike, FilterLike, Mb, Qb, Rec } from './types'

import { idx } from './bridge'
import { err, generateToken, SEVEN_DAYS_MS, time } from './helpers'
import { getOrgMember, requireOrgRole } from './org-crud'

/** Shape of an org invite document as stored in the orgInvite table. */
interface InviteDocLike {
  [k: string]: unknown
  _creationTime: number
  _id: GenericId<'orgInvite'>
  email: string
  expiresAt: number
  isAdmin: boolean
  orgId: GenericId<'org'>
  token: string
}

const makeInviteHandlers = ({ m, q }: { m: Mb; q: Qb }) => {
  const invite = m({
      args: { email: z.email(), isAdmin: z.boolean(), orgId: zid('org') },
      handler: async (c: Rec, { email, isAdmin, orgId }: { email: string; isAdmin: boolean; orgId: string }) => {
        await requireOrgRole({ db: c.db, minRole: 'admin', orgId, userId: (c.user as Rec)._id as string })
        const token = generateToken(),
          expiresAt = Date.now() + SEVEN_DAYS_MS,
          inviteId = await (c.db as DbLike).insert('orgInvite', {
            email,
            expiresAt,
            isAdmin,
            orgId,
            token
          })
        return { inviteId, token } as { inviteId: GenericId<'orgInvite'>; token: string }
      }
    }),
    acceptInvite = m({
      args: { token: z.string() },
      handler: async (c: Rec, { token }: { token: string }) => {
        const db = c.db as DbLike,
          userId = (c.user as Rec)._id as string,
          inviteDoc = await db
            .query('orgInvite')
            .withIndex(
              'by_token',
              idx(o => o.eq('token', token))
            )
            .unique()
        if (!inviteDoc) return err('INVALID_INVITE')
        if ((inviteDoc.expiresAt as number) < Date.now()) return err('INVITE_EXPIRED')
        const existingMember = await getOrgMember({ db, orgId: inviteDoc.orgId as string, userId }),
          orgDoc = await db.get(inviteDoc.orgId as string)
        if (!orgDoc) return err('NOT_FOUND')
        if (existingMember || orgDoc.userId === userId) return err('ALREADY_ORG_MEMBER')
        const pendingRequest = await db
          .query('orgJoinRequest')
          .withIndex(
            'by_org_status',
            idx(o => o.eq('orgId', inviteDoc.orgId).eq('status', 'pending'))
          )
          .filter((o: FilterLike) => o.eq(o.field('userId'), userId))
          .unique()
        if (pendingRequest) await db.patch(pendingRequest._id as string, { status: 'approved', ...time() })
        await db.insert('orgMember', {
          isAdmin: inviteDoc.isAdmin,
          orgId: inviteDoc.orgId,
          userId,
          ...time()
        })
        await db.delete(inviteDoc._id as string)
        return { orgId: inviteDoc.orgId } as { orgId: GenericId<'org'> }
      }
    }),
    revokeInvite = m({
      args: { inviteId: zid('orgInvite') },
      handler: async (c: Rec, { inviteId }: { inviteId: string }) => {
        const db = c.db as DbLike,
          inviteDoc = await db.get(inviteId)
        if (!inviteDoc) return err('NOT_FOUND')
        await requireOrgRole({
          db,
          minRole: 'admin',
          orgId: inviteDoc.orgId as string,
          userId: (c.user as Rec)._id as string
        })
        await db.delete(inviteId)
      }
    }),
    pendingInvites = q({
      args: { orgId: zid('org') },
      handler: async (c: Rec, { orgId }: { orgId: string }): Promise<InviteDocLike[]> => {
        await requireOrgRole({ db: c.db, minRole: 'admin', orgId, userId: (c.user as Rec)._id as string })
        return (c.db as DbLike)
          .query('orgInvite')
          .withIndex(
            'by_org',
            idx(o => o.eq('orgId', orgId))
          )
          .collect() as Promise<InviteDocLike[]>
      }
    })
  return { acceptInvite, invite, pendingInvites, revokeInvite }
}

export type { InviteDocLike }
export { makeInviteHandlers }
