import type { GenericId } from 'convex/values'

import { zid } from 'convex-helpers/server/zod4'
import { z } from 'zod/v4'

import type { DbLike, Mb, OrgRole, OrgUserLike, Qb, Rec } from './types'

import { idx } from './bridge'
import { err, time } from './helpers'
import { getOrgMember, getOrgRole, requireOrgMember, requireOrgRole } from './org-crud'

/** Shape of an org member item returned by the members endpoint, including role and user info. */
interface OrgMemberItem {
  memberId?: GenericId<'orgMember'>
  role: OrgRole
  user: null | OrgUserLike
  userId: GenericId<'users'>
}

const makeMemberHandlers = ({ m, q }: { m: Mb; q: Qb }) => {
  const membership = q({
      args: { orgId: zid('org') },
      handler: async (
        c: Rec,
        { orgId }: { orgId: string }
      ): Promise<null | { memberId: GenericId<'orgMember'> | null; role: OrgRole }> => {
        const db = c.db as DbLike,
          orgDoc = await db.get(orgId)
        if (!orgDoc) return err('NOT_FOUND')
        const userId = (c.user as Rec)._id as string,
          member = await getOrgMember({ db, orgId, userId }),
          role = getOrgRole({ member, org: orgDoc, userId })
        if (!role) return null
        return { memberId: member ? (member._id as GenericId<'orgMember'>) : null, role }
      }
    }),
    members = q({
      args: { orgId: zid('org') },
      handler: async (c: Rec, { orgId }: { orgId: string }): Promise<OrgMemberItem[]> => {
        const db = c.db as DbLike,
          userId = (c.user as Rec)._id as string
        await requireOrgMember({ db, orgId, userId })
        const orgDoc = await db.get(orgId)
        if (!orgDoc) return err('NOT_FOUND')
        const result: OrgMemberItem[] = [],
          ownerUser = await db.get(orgDoc.userId as string)
        result.push({
          role: 'owner',
          user: ownerUser as null | OrgUserLike,
          userId: orgDoc.userId as GenericId<'users'>
        })
        const memberDocs = await db
            .query('orgMember')
            .withIndex(
              'by_org',
              idx(o => o.eq('orgId', orgId))
            )
            .collect(),
          userDocs = await Promise.all(memberDocs.map(async (x: Rec) => db.get(x.userId as string)))
        for (let i = 0; i < memberDocs.length; i += 1) {
          const memberDoc = memberDocs[i],
            userDoc = userDocs[i]
          if (memberDoc)
            result.push({
              memberId: memberDoc._id as GenericId<'orgMember'>,
              role: memberDoc.isAdmin ? 'admin' : 'member',
              user: (userDoc as null | OrgUserLike) ?? null,
              userId: memberDoc.userId as GenericId<'users'>
            })
        }
        return result
      }
    }),
    setAdmin = m({
      args: { isAdmin: z.boolean(), memberId: zid('orgMember') },
      handler: async (c: Rec, { isAdmin, memberId }: { isAdmin: boolean; memberId: string }) => {
        const db = c.db as DbLike,
          memberDoc = await db.get(memberId)
        if (!memberDoc) return err('NOT_FOUND')
        const orgDoc = await db.get(memberDoc.orgId as string)
        if (!orgDoc) return err('NOT_FOUND')
        if (orgDoc.userId !== (c.user as Rec)._id) return err('FORBIDDEN')
        if (memberDoc.userId === orgDoc.userId) return err('CANNOT_MODIFY_OWNER')
        await db.patch(memberId, { isAdmin, ...time() })
      }
    }),
    removeMember = m({
      args: { memberId: zid('orgMember') },
      handler: async (c: Rec, { memberId }: { memberId: string }) => {
        const db = c.db as DbLike,
          memberDoc = await db.get(memberId)
        if (!memberDoc) return err('NOT_FOUND')
        const orgDoc = await db.get(memberDoc.orgId as string)
        if (!orgDoc) return err('NOT_FOUND')
        if (memberDoc.userId === orgDoc.userId) return err('CANNOT_MODIFY_OWNER')
        const { role } = await requireOrgRole({
          db,
          minRole: 'admin',
          orgId: memberDoc.orgId as string,
          userId: (c.user as Rec)._id as string
        })
        if (role === 'admin' && memberDoc.isAdmin) return err('CANNOT_MODIFY_ADMIN')
        await db.delete(memberId)
      }
    }),
    leave = m({
      args: { orgId: zid('org') },
      handler: async (c: Rec, { orgId }: { orgId: string }) => {
        const db = c.db as DbLike,
          orgDoc = await db.get(orgId)
        if (!orgDoc) return err('NOT_FOUND')
        const userId = (c.user as Rec)._id as string
        if (orgDoc.userId === userId) return err('MUST_TRANSFER_OWNERSHIP')
        const member = await getOrgMember({ db, orgId, userId })
        if (!member) return err('NOT_ORG_MEMBER')
        await db.delete((member as Rec)._id as string)
      }
    }),
    transferOwnership = m({
      args: { newOwnerId: zid('users'), orgId: zid('org') },
      handler: async (c: Rec, { newOwnerId, orgId }: { newOwnerId: string; orgId: string }) => {
        const db = c.db as DbLike,
          orgDoc = await db.get(orgId)
        if (!orgDoc) return err('NOT_FOUND')
        if (orgDoc.userId !== (c.user as Rec)._id) return err('FORBIDDEN')
        const targetMember = await getOrgMember({ db, orgId, userId: newOwnerId })
        if (!targetMember) return err('NOT_ORG_MEMBER')
        if (!(targetMember as Rec).isAdmin) return err('TARGET_MUST_BE_ADMIN')
        await db.patch(orgId, { userId: newOwnerId, ...time() })
        await db.delete((targetMember as Rec)._id as string)
        await db.insert('orgMember', {
          isAdmin: true,
          orgId,
          userId: (c.user as Rec)._id,
          ...time()
        })
      }
    })
  return { leave, members, membership, removeMember, setAdmin, transferOwnership }
}

export type { OrgMemberItem }
export { makeMemberHandlers }
