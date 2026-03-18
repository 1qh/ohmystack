import type { GenericId } from 'convex/values'

import { zid } from 'convex-helpers/server/zod4'
import { z } from 'zod/v4'

import type { DbLike, FilterLike, Mb, OrgUserLike, Qb, Rec } from './types'

import { idx } from './bridge'
import { err, time } from './helpers'
import { getOrgMember, requireOrgRole } from './org-crud'

/** Shape of a join request item returned by pendingJoinRequests, including the request doc and associated user. */
interface JoinRequestItem {
  request: {
    [k: string]: unknown
    _creationTime: number
    _id: GenericId<'orgJoinRequest'>
    message?: string
    orgId: GenericId<'org'>
    status: string
    userId: GenericId<'users'>
  }
  user: null | OrgUserLike
}

const makeJoinHandlers = ({ m, q }: { m: Mb; q: Qb }) => {
  const requestJoin = m({
      args: { message: z.string().optional(), orgId: zid('org') },
      handler: async (c: Rec, { message, orgId }: { message?: string; orgId: string }) => {
        const db = c.db as DbLike,
          userId = (c.user as Rec)._id as string,
          orgDoc = await db.get(orgId)
        if (!orgDoc) return err('NOT_FOUND')
        const existingMember = await getOrgMember({ db, orgId, userId })
        if (existingMember || orgDoc.userId === userId) return err('ALREADY_ORG_MEMBER')
        const existingRequest = await db
          .query('orgJoinRequest')
          .withIndex(
            'by_org_status',
            idx(o => o.eq('orgId', orgId).eq('status', 'pending'))
          )
          .filter((o: FilterLike) => o.eq(o.field('userId'), userId))
          .unique()
        if (existingRequest) return err('JOIN_REQUEST_EXISTS')
        const requestId = await db.insert('orgJoinRequest', {
          message,
          orgId,
          status: 'pending',
          userId
        })
        return { requestId } as { requestId: GenericId<'orgJoinRequest'> }
      }
    }),
    approveJoinRequest = m({
      args: { isAdmin: z.boolean().optional(), requestId: zid('orgJoinRequest') },
      handler: async (c: Rec, { isAdmin, requestId }: { isAdmin?: boolean; requestId: string }) => {
        const db = c.db as DbLike,
          requestDoc = await db.get(requestId)
        if (!requestDoc) return err('NOT_FOUND')
        await requireOrgRole({
          db,
          minRole: 'admin',
          orgId: requestDoc.orgId as string,
          userId: (c.user as Rec)._id as string
        })
        await db.insert('orgMember', {
          isAdmin: isAdmin ?? false,
          orgId: requestDoc.orgId,
          userId: requestDoc.userId,
          ...time()
        })
        await db.patch(requestId, { status: 'approved' })
      }
    }),
    rejectJoinRequest = m({
      args: { requestId: zid('orgJoinRequest') },
      handler: async (c: Rec, { requestId }: { requestId: string }) => {
        const db = c.db as DbLike,
          requestDoc = await db.get(requestId)
        if (!requestDoc) return err('NOT_FOUND')
        await requireOrgRole({
          db,
          minRole: 'admin',
          orgId: requestDoc.orgId as string,
          userId: (c.user as Rec)._id as string
        })
        await db.patch(requestId, { status: 'rejected' })
      }
    }),
    cancelJoinRequest = m({
      args: { requestId: zid('orgJoinRequest') },
      handler: async (c: Rec, { requestId }: { requestId: string }) => {
        const db = c.db as DbLike,
          requestDoc = await db.get(requestId)
        if (!requestDoc) return err('NOT_FOUND')
        if (requestDoc.userId !== (c.user as Rec)._id) return err('FORBIDDEN')
        if (requestDoc.status !== 'pending') return err('NOT_FOUND')
        await db.delete(requestId)
      }
    }),
    pendingJoinRequests = q({
      args: { orgId: zid('org') },
      handler: async (c: Rec, { orgId }: { orgId: string }): Promise<JoinRequestItem[]> => {
        const db = c.db as DbLike
        await requireOrgRole({ db, minRole: 'admin', orgId, userId: (c.user as Rec)._id as string })
        const requests = await db
            .query('orgJoinRequest')
            .withIndex(
              'by_org_status',
              idx(o => o.eq('orgId', orgId).eq('status', 'pending'))
            )
            .collect(),
          users = await Promise.all(requests.map(async (r: Rec) => db.get(r.userId as string))),
          result: JoinRequestItem[] = []
        for (let i = 0; i < requests.length; i += 1) {
          const req = requests[i],
            usr = users[i]
          if (req) result.push({ request: req as JoinRequestItem['request'], user: (usr as null | OrgUserLike) ?? null })
        }
        return result
      }
    }),
    myJoinRequest = q({
      args: { orgId: zid('org') },
      handler: async (c: Rec, { orgId }: { orgId: string }) =>
        (c.db as DbLike)
          .query('orgJoinRequest')
          .withIndex(
            'by_org_status',
            idx(o => o.eq('orgId', orgId).eq('status', 'pending'))
          )
          .filter((o: FilterLike) => o.eq(o.field('userId'), (c.user as Rec)._id))
          .unique() as Promise<null | {
          _id: GenericId<'orgJoinRequest'>
          message?: string
          orgId: GenericId<'org'>
          status: string
          userId: GenericId<'users'>
        }>
    })
  return { approveJoinRequest, cancelJoinRequest, myJoinRequest, pendingJoinRequests, rejectJoinRequest, requestJoin }
}

export type { JoinRequestItem }
export { makeJoinHandlers }
