/* oxlint-disable eslint/no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB mutations */
/* eslint-disable no-await-in-loop */
/* oxlint-disable no-underscore-dangle -- Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
/* oxlint-disable eslint(no-underscore-dangle) */
import type { GenericDataModel, GenericMutationCtx, GenericQueryCtx, MutationBuilder, QueryBuilder } from 'convex/server'
import type { GenericId } from 'convex/values'
import type { ZodObject, ZodRawShape } from 'zod/v4'
import { customCtx } from 'convex-helpers/server/customFunctions'
import { zCustomMutation, zCustomQuery, zid } from 'convex-helpers/server/zod4'
import { z } from 'zod/v4'
import type { DbLike, Mb, OrgRole, Qb, Rec, StorageLike } from './types'
import { idx, typed } from './bridge'
import { cleanFiles, err, getUser, log, time } from './helpers'
import { requireOrgMember, requireOrgRole } from './org-crud'
import { makeInviteHandlers } from './org-invites'
import { makeJoinHandlers } from './org-join'
import { makeMemberHandlers } from './org-members'
interface CascadeTableEntry {
  fileFields?: string[]
  table: string
}
/** Shape of an organization document as returned by org queries. */
interface OrgDocLike {
  [k: string]: unknown
  _creationTime: number
  _id: GenericId<'org'>
  avatarId?: GenericId<'_storage'> | null
  name: string
  slug: string
  updatedAt: number
  userId: GenericId<'users'>
}
/**
 * Creates the full set of org management endpoints: CRUD, members, invites, and join requests.
 * @param config - Query/mutation builders, auth function, org schema, and optional cascade table config
 * @returns Object with create, update, get, getBySlug, myOrgs, remove, member/invite/join endpoints
 */
const makeOrg = <DM extends GenericDataModel, S extends ZodRawShape>({
  cascadeTables,
  getAuthUserId,
  mutation,
  query,
  schema: orgSchema
}: {
  cascadeTables?: CascadeTableEntry[]
  getAuthUserId: (ctx: never) => Promise<null | string>
  mutation: MutationBuilder<DM, 'public'>
  query: QueryBuilder<DM, 'public'>
  schema: ZodObject<S>
}) => {
  const mb = typed(
    zCustomMutation(
      mutation,
      customCtx(async (c: GenericMutationCtx<DM>) => ({
        storage: typed(c.storage),
        user: await getUser({ ctx: typed(c), db: typed(c.db), getAuthUserId })
      }))
    )
  ) as Mb
  const qb = typed(
    zCustomQuery(
      query,
      customCtx(async (c: GenericQueryCtx<DM>) => ({
        user: await getUser({ ctx: typed(c), db: typed(c.db), getAuthUserId })
      }))
    )
  ) as Qb
  const pqb = typed(
    zCustomQuery(
      query,
      customCtx(() => ({}))
    )
  ) as Qb
  const m = mb
  const q = qb
  const pq = pqb
  const create = m({
    args: { data: orgSchema },
    handler: async (c: Rec, { data }: { data: Rec }) => {
      const existing = await (c.db as DbLike)
        .query('org')
        .withIndex(
          'by_slug',
          idx(o => o.eq('slug', data.slug))
        )
        .unique()
      if (existing) return err('ORG_SLUG_TAKEN')
      const orgId = await (c.db as DbLike).insert('org', {
        avatarId: data.avatarId,
        name: data.name,
        slug: data.slug,
        userId: (c.user as Rec)._id,
        ...time()
      })
      return { orgId } as { orgId: GenericId<'org'> }
    }
  })
  const update = m({
    args: { data: orgSchema.partial(), orgId: zid('org') },
    handler: async (c: Rec, { data, orgId }: { data: Rec; orgId: string }) => {
      await requireOrgRole({ db: c.db, minRole: 'admin', orgId, userId: (c.user as Rec)._id as string })
      const newSlug = data.slug as string | undefined
      if (newSlug !== undefined) {
        const existing = await (c.db as DbLike)
          .query('org')
          .withIndex(
            'by_slug',
            idx(o => o.eq('slug', newSlug))
          )
          .unique()
        if (existing && existing._id !== orgId) return err('ORG_SLUG_TAKEN')
      }
      const patchData: Rec = {}
      const db = c.db as DbLike
      if (data.name !== undefined) patchData.name = data.name
      if (newSlug !== undefined) patchData.slug = newSlug
      if (data.avatarId !== undefined) {
        const org = await db.get(orgId)
        const oldAvatarId = org?.avatarId as string | undefined
        patchData.avatarId = data.avatarId ?? undefined
        if (oldAvatarId && oldAvatarId !== data.avatarId) {
          const storage = c.storage as undefined | { delete: (id: string) => Promise<void> }
          if (storage)
            try {
              await storage.delete(oldAvatarId)
            } catch {
              log('warn', 'org:avatar_cleanup_failed', { avatarId: oldAvatarId, orgId })
            }
        }
      }
      await db.patch(orgId, { ...patchData, ...time() })
    }
  })
  const get = q({
    args: { orgId: zid('org') },
    handler: async (c: Rec, { orgId }: { orgId: string }): Promise<null | OrgDocLike> => {
      await requireOrgMember({ db: c.db, orgId, userId: (c.user as Rec)._id as string })
      return (c.db as DbLike).get(orgId) as Promise<null | OrgDocLike>
    }
  })
  const getBySlug = pq({
    args: { slug: z.string() },
    handler: async (c: Rec, { slug }: { slug: string }): Promise<null | OrgDocLike> =>
      (c.db as DbLike)
        .query('org')
        .withIndex(
          'by_slug',
          idx(o => o.eq('slug', slug))
        )
        .unique() as Promise<null | OrgDocLike>
  })
  const getPublic = pq({
    args: { slug: z.string() },
    handler: async (
      c: Rec,
      { slug }: { slug: string }
    ): Promise<null | { _id: GenericId<'org'>; avatarId?: GenericId<'_storage'>; name: string; slug: string }> => {
      const orgDoc = await (c.db as DbLike)
        .query('org')
        .withIndex(
          'by_slug',
          idx(o => o.eq('slug', slug))
        )
        .unique()
      if (!orgDoc) return null
      return {
        _id: orgDoc._id as GenericId<'org'>,
        avatarId: orgDoc.avatarId as GenericId<'_storage'> | undefined,
        name: orgDoc.name as string,
        slug: orgDoc.slug as string
      }
    }
  })
  const myOrgs = q({
    args: {},
    handler: async (c: Rec): Promise<{ org: OrgDocLike; role: OrgRole }[]> => {
      const uid = (c.user as Rec)._id as string
      const db = c.db as DbLike
      const ownedOrgs = await db
        .query('org')
        .withIndex(
          'by_user',
          idx(o => o.eq('userId', uid))
        )
        .collect()
      const memberships = await db
        .query('orgMember')
        .withIndex(
          'by_user',
          idx(o => o.eq('userId', uid))
        )
        .collect()
      const memberOrgIds = memberships.map((x: Rec) => x.orgId as string)
      const memberOrgResults = await Promise.all(memberOrgIds.map(async (id: string) => db.get(id)))
      const memberOrgs: Rec[] = []
      for (const orgDoc of memberOrgResults) if (orgDoc) memberOrgs.push(orgDoc)
      const ownedIds = new Set(ownedOrgs.map((o: Rec) => o._id as string))
      const result: { org: OrgDocLike; role: OrgRole }[] = []
      for (const o of ownedOrgs) result.push({ org: o as OrgDocLike, role: 'owner' })
      for (const o of memberOrgs)
        if (!ownedIds.has(o._id as string)) {
          const member = memberships.find((x: Rec) => x.orgId === o._id)
          const role: OrgRole = member?.isAdmin ? 'admin' : 'member'
          result.push({ org: o as OrgDocLike, role })
        }
      return result
    }
  })
  const remove = m({
    args: { orgId: zid('org') },
    handler: async (c: Rec, { orgId }: { orgId: string }) => {
      const db = c.db as DbLike
      const { storage } = c as { storage?: StorageLike }
      const orgDoc = await db.get(orgId)
      if (!orgDoc) return err('NOT_FOUND')
      if (orgDoc.userId !== (c.user as Rec)._id) return err('FORBIDDEN')
      if (cascadeTables)
        for (const { fileFields, table } of cascadeTables) {
          const docs = await db
            .query(table)
            .withIndex(
              'by_org',
              idx(o => o.eq('orgId', orgId))
            )
            .collect()
          for (const d of docs) {
            if (fileFields && fileFields.length > 0 && storage) await cleanFiles({ doc: d, fileFields, storage })
            await db.delete(d._id as string)
          }
        }
      const joinRequests = await db
        .query('orgJoinRequest')
        .withIndex(
          'by_org',
          idx(o => o.eq('orgId', orgId))
        )
        .collect()
      await Promise.all(joinRequests.map(async (r: Rec) => db.delete(r._id as string)))
      const invites = await db
        .query('orgInvite')
        .withIndex(
          'by_org',
          idx(o => o.eq('orgId', orgId))
        )
        .collect()
      await Promise.all(invites.map(async (i: Rec) => db.delete(i._id as string)))
      const orgMembers = await db
        .query('orgMember')
        .withIndex(
          'by_org',
          idx(o => o.eq('orgId', orgId))
        )
        .collect()
      await Promise.all(orgMembers.map(async (x: Rec) => db.delete(x._id as string)))
      if (storage && orgDoc.avatarId)
        try {
          await storage.delete(orgDoc.avatarId as string)
        } catch {
          log('warn', 'org:avatar_cleanup_failed', { avatarId: orgDoc.avatarId, orgId })
        }
      await db.delete(orgId)
    }
  })
  const isSlugAvailable = pq({
    args: { slug: z.string() },
    handler: async (c: Rec, { slug }: { slug: string }) => {
      const existing = await (c.db as DbLike)
        .query('org')
        .withIndex(
          'by_slug',
          idx(o => o.eq('slug', slug))
        )
        .unique()
      return { available: !existing }
    }
  })
  const memberOps = makeMemberHandlers({ m, q })
  const inviteOps = makeInviteHandlers({ m, q })
  const joinOps = makeJoinHandlers({ m, q })
  return {
    ...inviteOps,
    ...joinOps,
    ...memberOps,
    create,
    get,
    getBySlug,
    getPublic,
    isSlugAvailable,
    myOrgs,
    remove,
    update
  }
}
export { makeOrg }
export type { OrgDocLike }
export type { InviteDocLike } from './org-invites'
export type { JoinRequestItem } from './org-join'
export type { OrgMemberItem } from './org-members'
export type { OrgUserLike } from './types'
