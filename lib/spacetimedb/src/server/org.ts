import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, ReducerExport, TypeBuilder } from 'spacetimedb/server'

import type { OrgInviteByTokenIndexLike, OrgInvitePkLike, OrgInviteRowLike, OrgInviteTableLike } from './org-invites'
import type {
  OrgJoinRequestByOrgStatusIndexLike,
  OrgJoinRequestPkLike,
  OrgJoinRequestRowLike,
  OrgJoinRequestTableLike
} from './org-join'
import type { OrgMemberPkLike, OrgMemberRowLike, OrgMemberTableLike, OrgPkLike, OrgRowLike } from './org-members'

import { makeInviteReducers } from './org-invites'
import { makeJoinReducers } from './org-join'
import { makeMemberReducers } from './org-members'
import { identityEquals, makeError } from './reducer-utils'
/** Cascade deletion adapter for removing org-scoped related rows. */
interface CascadeTableConfig<DB, OrgId> {
  deleteById: (db: DB, id: unknown) => boolean
  rowsByOrg: (db: DB, orgId: OrgId) => Iterable<{ id: unknown }>
}
/** Lightweight invite row shape used by org helpers. */
interface InviteDocLike {
  email: string
  expiresAt: number
  id: unknown
  isAdmin: boolean
  orgId: unknown
  token: string
}
/** Join request item enriched with optional user profile data. */
interface JoinRequestItem {
  request: OrgJoinRequestRowLike<unknown, unknown>
  user: null | OrgUserLike
}
interface OptionalBuilder {
  optional: () => TypeBuilder<unknown, AlgebraicTypeType>
}
/** Iterable index that groups organizations by user. */
type OrgByUserIndexLike<Row> = Iterable<Row>
/** Configuration object used by `makeOrg` to generate org reducers. */
interface OrgConfig<
  DB,
  OrgId,
  MemberId,
  InviteId,
  RequestId,
  UserId,
  OrgRow extends OrgRowLike<OrgId>,
  MemberRow extends OrgMemberRowLike<MemberId, OrgId>,
  InviteRow extends OrgInviteRowLike<InviteId, OrgId>,
  JoinRequestRow extends OrgJoinRequestRowLike<RequestId, OrgId>
> {
  builders: {
    email: TypeBuilder<string, AlgebraicTypeType>
    inviteId: TypeBuilder<InviteId, AlgebraicTypeType>
    isAdmin: TypeBuilder<boolean, AlgebraicTypeType>
    memberId: TypeBuilder<MemberId, AlgebraicTypeType>
    message: OptionalBuilder
    newOwnerId: TypeBuilder<UserId, AlgebraicTypeType>
    orgId: TypeBuilder<OrgId, AlgebraicTypeType>
    requestId: TypeBuilder<RequestId, AlgebraicTypeType>
    token: TypeBuilder<string, AlgebraicTypeType>
  }
  cascadeTables?: CascadeTableConfig<DB, OrgId>[]
  fields: OrgFieldBuilders
  orgByUserIndex: (table: Iterable<OrgRow>) => OrgByUserIndexLike<OrgRow>
  orgInviteByOrgIndex: (table: OrgInviteTableLike<InviteRow>) => OrgInviteByOrgIndexLike<InviteRow, OrgId>
  orgInviteByTokenIndex: (table: OrgInviteTableLike<InviteRow>) => OrgInviteByTokenIndexLike<InviteRow>
  orgInvitePk: (table: OrgInviteTableLike<InviteRow>) => OrgInvitePkLike<InviteRow, InviteId>
  orgInviteTable: (db: DB) => OrgInviteTableLike<InviteRow>
  orgJoinRequestByOrgIndex: (
    table: OrgJoinRequestTableLike<JoinRequestRow>
  ) => OrgJoinRequestByOrgIndexLike<JoinRequestRow, OrgId>
  orgJoinRequestByOrgStatusIndex: (
    table: OrgJoinRequestTableLike<JoinRequestRow>
  ) => OrgJoinRequestByOrgStatusIndexLike<JoinRequestRow, OrgId>
  orgJoinRequestPk: (table: OrgJoinRequestTableLike<JoinRequestRow>) => OrgJoinRequestPkLike<JoinRequestRow, RequestId>
  orgJoinRequestTable: (db: DB) => OrgJoinRequestTableLike<JoinRequestRow>
  orgMemberByOrgIndex: (table: OrgMemberTableLike<MemberRow>) => OrgMemberByOrgIndexLike<MemberRow, OrgId>
  orgMemberByUserIndex: (table: OrgMemberTableLike<MemberRow>) => Iterable<MemberRow>
  orgMemberPk: (table: OrgMemberTableLike<MemberRow>) => OrgMemberPkLike<MemberRow, MemberId>
  orgMemberTable: (db: DB) => OrgMemberTableLike<MemberRow>
  orgPk: (table: Iterable<OrgRow>) => OrgPkLike<OrgRow, OrgId>
  orgSlugIndex: (table: Iterable<OrgRow>) => OrgSlugIndexLike<OrgRow>
  orgTable: (db: DB) => Iterable<OrgRow> & { insert: (row: OrgRow) => OrgRow }
}
/** Minimal organization document shape used by server helpers. */
interface OrgDocLike {
  [key: string]: unknown
  id: unknown
  name: string
  slug: string
  userId: Identity
}
/** Reducer export container returned by org reducer builders. */
interface OrgExports {
  exports: Record<string, ReducerExport<never, never>>
}
/** Builder map for organization create/update fields. */
interface OrgFieldBuilders {
  [key: string]: OptionalBuilder | TypeBuilder<unknown, AlgebraicTypeType>
  name: TypeBuilder<string, AlgebraicTypeType>
  slug: TypeBuilder<string, AlgebraicTypeType>
}
/** Invite index abstraction scoped by organization id. */
interface OrgInviteByOrgIndexLike<Row, OrgId> extends Iterable<Row> {
  filterByOrg: (orgId: OrgId) => Iterable<Row>
}
/** Join-request index abstraction scoped by organization id. */
interface OrgJoinRequestByOrgIndexLike<Row, OrgId> extends Iterable<Row> {
  filterByOrg: (orgId: OrgId) => Iterable<Row>
}
/** Member index abstraction scoped by organization id. */
interface OrgMemberByOrgIndexLike<Row, OrgId> extends Iterable<Row> {
  filterByOrg: (orgId: OrgId) => Iterable<Row>
}
/** Member record enriched with role and user profile data. */
interface OrgMemberItem {
  memberId?: unknown
  role: OrgRole
  user: null | OrgUserLike
  userId: Identity
}
type OrgRole = 'admin' | 'member' | 'owner'
/** Iterable index used to resolve org rows by slug. */
type OrgSlugIndexLike<Row> = Iterable<Row>
/** Minimal user profile shape used by org flows. */
interface OrgUserLike {
  [key: string]: unknown
  email?: string
  id?: unknown
  image?: string
  name?: string
}
const makeOptionalFields = (fields: OrgFieldBuilders) => {
    const optionalFields: Record<string, TypeBuilder<unknown, AlgebraicTypeType>> = {},
      keys = Object.keys(fields)
    for (const key of keys) {
      const field = fields[key] as OptionalBuilder
      if (typeof field.optional === 'function') optionalFields[key] = field.optional()
    }
    return optionalFields
  },
  findOrgBySlug = <OrgRow extends { slug: string }>(slugIndex: Iterable<OrgRow>, slug: string): null | OrgRow => {
    for (const org of slugIndex) if (org.slug === slug) return org
    return null
  },
  findOrgMember = <OrgId, MemberId, MemberRow extends OrgMemberRowLike<MemberId, OrgId>>(
    orgMemberTable: Iterable<MemberRow>,
    orgId: OrgId,
    userId: Identity
  ): MemberRow | null => {
    for (const member of orgMemberTable)
      if (Object.is(member.orgId, orgId) && identityEquals(member.userId, userId)) return member
    return null
  },
  getRole = <OrgId, MemberId>(
    org: OrgRowLike<OrgId>,
    member: null | OrgMemberRowLike<MemberId, OrgId>,
    sender: Identity
  ): null | OrgRole => {
    if (identityEquals(org.userId, sender)) return 'owner'
    if (!member) return null
    if (member.isAdmin) return 'admin'
    return 'member'
  },
  requireRole = <OrgId, MemberId>({
    minRole,
    operation,
    org,
    orgMemberTable,
    sender
  }: {
    minRole: 'admin' | 'owner'
    operation: string
    org: OrgRowLike<OrgId>
    orgMemberTable: Iterable<OrgMemberRowLike<MemberId, OrgId>>
    sender: Identity
  }) => {
    const member = findOrgMember(orgMemberTable, org.id, sender),
      role = getRole(org, member, sender)
    if (!role) throw makeError('NOT_ORG_MEMBER', `org:${operation}`)
    if (minRole === 'owner' && role !== 'owner') throw makeError('FORBIDDEN', `org:${operation}`)
    if (minRole === 'admin' && role === 'member') throw makeError('FORBIDDEN', `org:${operation}`)
  },
  applyOrgUpdate = <OrgId, MemberId, OrgRow extends OrgRowLike<OrgId> & { slug: string }>(opts: {
    args: Record<string, unknown> & { orgId: OrgId }
    org: OrgRow
    orgMemberTable: Iterable<OrgMemberRowLike<MemberId, OrgId>>
    orgPk: OrgPkLike<OrgRow, OrgId>
    orgSlugIndex: OrgSlugIndexLike<OrgRow>
    sender: Identity
    timestamp: Timestamp
  }) => {
    requireRole({
      minRole: 'admin',
      operation: 'update',
      org: opts.org,
      orgMemberTable: opts.orgMemberTable,
      sender: opts.sender
    })
    const nextSlugValue = opts.args.slug
    if (typeof nextSlugValue === 'string' && nextSlugValue !== opts.org.slug) {
      const existing = findOrgBySlug(opts.orgSlugIndex, nextSlugValue)
      if (existing && !Object.is(existing.id, opts.org.id)) throw makeError('ORG_SLUG_TAKEN', 'org:update')
    }
    const nextRecord = { ...(opts.org as unknown as Record<string, unknown>), updatedAt: opts.timestamp } as Record<
        string,
        unknown
      >,
      argKeys = Object.keys(opts.args)
    for (const key of argKeys)
      if (key !== 'orgId') {
        const value = opts.args[key]
        if (value !== undefined) nextRecord[key] = value
      }
    opts.orgPk.update(nextRecord as unknown as OrgRow)
  },
  removeByPk = <Id>(rows: Iterable<{ id: Id }>, pk: { delete: (id: Id) => boolean }, message: string) => {
    for (const row of rows) {
      const removed = pk.delete(row.id)
      if (!removed) throw makeError('NOT_FOUND', message)
    }
  },
  removeCascadeRows = <DB, OrgId>(cascadeTables: CascadeTableConfig<DB, OrgId>[] | undefined, db: DB, orgId: OrgId) => {
    if (!cascadeTables) return
    for (const cascadeTable of cascadeTables)
      for (const row of cascadeTable.rowsByOrg(db, orgId)) {
        const removed = cascadeTable.deleteById(db, row.id)
        if (!removed) throw makeError('NOT_FOUND', 'org:remove_cascade')
      }
  },
  removeMembersByOrg = <OrgId, MemberRow>(
    memberByOrgIndex: OrgMemberByOrgIndexLike<MemberRow, OrgId>,
    orgId: OrgId,
    orgMemberTable: { delete: (row: MemberRow) => boolean }
  ) => {
    for (const member of memberByOrgIndex.filterByOrg(orgId)) {
      const removed = orgMemberTable.delete(member)
      if (!removed) throw makeError('NOT_FOUND', 'org:remove_member')
    }
  },
  mergeReducerExports = (...parts: OrgExports[]): OrgExports => {
    const exportsRecord: Record<string, ReducerExport<never, never>> = {}
    for (const part of parts) {
      const names = Object.keys(part.exports)
      for (const name of names) {
        const reducer = part.exports[name]
        if (reducer) exportsRecord[name] = reducer
      }
    }
    return { exports: exportsRecord }
  },
  /** Creates a complete set of organization lifecycle reducers.
   * @param spacetimedb - SpacetimeDB reducer factory
   * @param config - Organization reducer configuration
   * @returns Reducer export map for org, membership, invite, and join flows
   */
  makeOrg = <
    DB,
    OrgId,
    MemberId,
    InviteId,
    RequestId,
    UserId,
    OrgRow extends OrgRowLike<OrgId> & { name: string; slug: string },
    MemberRow extends OrgMemberRowLike<MemberId, OrgId>,
    InviteRow extends OrgInviteRowLike<InviteId, OrgId>,
    JoinRequestRow extends OrgJoinRequestRowLike<RequestId, OrgId>
  >(
    spacetimedb: {
      reducer: (
        opts: { name: string },
        params: Record<string, TypeBuilder<unknown, AlgebraicTypeType>>,
        fn: (ctx: { db: DB; sender: Identity; timestamp: Timestamp }, args: Record<string, unknown>) => void
      ) => ReducerExport<never, never>
    },
    config: OrgConfig<DB, OrgId, MemberId, InviteId, RequestId, UserId, OrgRow, MemberRow, InviteRow, JoinRequestRow>
  ): OrgExports => {
    const orgFields = config.fields,
      optionalOrgFields = makeOptionalFields(orgFields),
      updateParams: Record<string, TypeBuilder<unknown, AlgebraicTypeType>> = {
        orgId: config.builders.orgId
      },
      optionalKeys = Object.keys(optionalOrgFields)
    for (const key of optionalKeys) {
      const field = optionalOrgFields[key]
      if (field) updateParams[key] = field
    }
    const createReducer = spacetimedb.reducer(
        { name: 'org_create' },
        orgFields as Record<string, TypeBuilder<unknown, AlgebraicTypeType>>,
        (ctx, args: Record<string, unknown>) => {
          const orgTable = config.orgTable(ctx.db),
            orgSlugIndex = config.orgSlugIndex(orgTable),
            { slug } = args
          if (typeof slug !== 'string') throw makeError('VALIDATION_FAILED', 'org:create_slug')
          const existing = findOrgBySlug(orgSlugIndex as Iterable<OrgRow>, slug)
          if (existing) throw makeError('ORG_SLUG_TAKEN', 'org:create')
          const payload = {
            ...args,
            createdAt: ctx.timestamp,
            id: 0 as OrgId,
            updatedAt: ctx.timestamp,
            userId: ctx.sender
          } as OrgRow
          orgTable.insert(payload)
        }
      ),
      updateReducer = spacetimedb.reducer({ name: 'org_update' }, updateParams, (ctx, args) => {
        const typedArgs = args as Record<string, unknown> & { orgId: OrgId },
          orgTable = config.orgTable(ctx.db),
          orgPk: OrgPkLike<OrgRow, OrgId> = config.orgPk(orgTable),
          orgMemberTable = config.orgMemberTable(ctx.db),
          orgSlugIndex: OrgSlugIndexLike<OrgRow> = config.orgSlugIndex(orgTable),
          org = orgPk.find(typedArgs.orgId)
        if (!org) throw makeError('NOT_FOUND', 'org:update')
        applyOrgUpdate({
          args: typedArgs,
          org,
          orgMemberTable,
          orgPk,
          orgSlugIndex,
          sender: ctx.sender,
          timestamp: ctx.timestamp
        })
      }),
      removeReducer = spacetimedb.reducer({ name: 'org_remove' }, { orgId: config.builders.orgId }, (ctx, args) => {
        const typedArgs = args as { orgId: OrgId },
          orgTable = config.orgTable(ctx.db),
          orgPk: OrgPkLike<OrgRow, OrgId> = config.orgPk(orgTable),
          orgMemberTable = config.orgMemberTable(ctx.db),
          orgInviteTable = config.orgInviteTable(ctx.db),
          orgInvitePk: OrgInvitePkLike<InviteRow, InviteId> = config.orgInvitePk(orgInviteTable),
          orgJoinRequestTable = config.orgJoinRequestTable(ctx.db),
          orgJoinRequestPk: OrgJoinRequestPkLike<JoinRequestRow, RequestId> = config.orgJoinRequestPk(orgJoinRequestTable),
          org = orgPk.find(typedArgs.orgId)
        if (!org) throw makeError('NOT_FOUND', 'org:remove')
        requireRole({ minRole: 'owner', operation: 'remove', org, orgMemberTable, sender: ctx.sender })
        removeCascadeRows(config.cascadeTables, ctx.db, typedArgs.orgId)
        const joinByOrg = config.orgJoinRequestByOrgIndex(orgJoinRequestTable),
          inviteByOrg = config.orgInviteByOrgIndex(orgInviteTable),
          memberByOrg = config.orgMemberByOrgIndex(orgMemberTable)
        removeByPk(joinByOrg.filterByOrg(typedArgs.orgId), orgJoinRequestPk, 'org:remove_join_request')
        removeByPk(inviteByOrg.filterByOrg(typedArgs.orgId), orgInvitePk, 'org:remove_invite')
        removeMembersByOrg(memberByOrg, typedArgs.orgId, orgMemberTable)
        if (!orgPk.delete(typedArgs.orgId)) throw makeError('NOT_FOUND', 'org:remove')
      }),
      memberReducers = makeMemberReducers(spacetimedb, {
        builders: {
          isAdmin: config.builders.isAdmin,
          memberId: config.builders.memberId,
          newOwnerId: config.builders.newOwnerId,
          orgId: config.builders.orgId
        },
        orgMemberPk: config.orgMemberPk,
        orgMemberTable: config.orgMemberTable,
        orgPk: config.orgPk,
        orgTable: config.orgTable
      }),
      inviteReducers = makeInviteReducers(spacetimedb, {
        builders: {
          email: config.builders.email,
          inviteId: config.builders.inviteId,
          isAdmin: config.builders.isAdmin,
          orgId: config.builders.orgId,
          token: config.builders.token
        },
        orgInviteByTokenIndex: config.orgInviteByTokenIndex,
        orgInvitePk: config.orgInvitePk,
        orgInviteTable: config.orgInviteTable,
        orgJoinRequestByOrgStatusIndex: config.orgJoinRequestByOrgStatusIndex as unknown as (
          table: Iterable<JoinRequestRow>
        ) => Iterable<JoinRequestRow> & {
          filterByOrgStatus: (orgId: OrgId, status: string) => Iterable<JoinRequestRow>
        },
        orgJoinRequestPk: config.orgJoinRequestPk as unknown as (table: Iterable<JoinRequestRow>) => {
          update: (row: JoinRequestRow) => JoinRequestRow
        },
        orgJoinRequestTable: config.orgJoinRequestTable as unknown as (db: DB) => Iterable<JoinRequestRow>,
        orgMemberTable: config.orgMemberTable,
        orgPk: config.orgPk,
        orgTable: config.orgTable
      }),
      joinReducers = makeJoinReducers(spacetimedb, {
        builders: {
          isAdmin: config.builders.isAdmin,
          message: config.builders.message,
          orgId: config.builders.orgId,
          requestId: config.builders.requestId
        },
        orgJoinRequestByOrgStatusIndex: config.orgJoinRequestByOrgStatusIndex,
        orgJoinRequestPk: config.orgJoinRequestPk,
        orgJoinRequestTable: config.orgJoinRequestTable,
        orgMemberTable: config.orgMemberTable,
        orgPk: config.orgPk,
        orgTable: config.orgTable
      }),
      lifecycleReducers: OrgExports = {
        exports: {
          org_create: createReducer,
          org_remove: removeReducer,
          org_update: updateReducer
        }
      }
    return mergeReducerExports(lifecycleReducers, memberReducers, inviteReducers, joinReducers)
  },
  asRec = (x: unknown) => x as Record<string, unknown>,
  wrapByOrgIndex = <Row, OrgId>(
    tbl: Iterable<Row> & { orgId: { filter: (orgId: OrgId) => Iterable<Row> } }
  ): { [Symbol.iterator]: () => Iterator<Row>; filterByOrg: (orgId: OrgId) => Iterable<Row> } => ({
    filterByOrg: (orgId: OrgId) => tbl.orgId.filter(orgId),
    [Symbol.iterator]: () => tbl[Symbol.iterator]()
  }),
  /** @see {@link makeOrg} for the full org lifecycle API */
  makeOrgTables = <
    DB,
    OrgId,
    MemberId,
    InviteId,
    RequestId,
    OrgRow extends OrgRowLike<OrgId> & { slug: string; userId: Identity },
    MemberRow extends OrgMemberRowLike<MemberId, OrgId>,
    InviteRow extends OrgInviteRowLike<InviteId, OrgId>,
    JoinRequestRow extends OrgJoinRequestRowLike<RequestId, OrgId>
  >(tables: {
    org: (db: DB) => Iterable<OrgRow> & {
      id: { delete: (id: OrgId) => boolean; find: (id: OrgId) => null | OrgRow; update: (row: OrgRow) => OrgRow }
      insert: (row: OrgRow) => OrgRow
      slug: object
      userId: object
    }
    orgInvite: (db: DB) => OrgInviteTableLike<InviteRow> & {
      id: { delete: (id: InviteId) => boolean; find: (id: InviteId) => InviteRow | null }
      orgId: { filter: (orgId: OrgId) => Iterable<InviteRow> }
      token: object
    }
    orgJoinRequest: (db: DB) => OrgJoinRequestTableLike<JoinRequestRow> & {
      id: {
        delete: (id: RequestId) => boolean
        find: (id: RequestId) => JoinRequestRow | null
        update: (row: JoinRequestRow) => JoinRequestRow
      }
      orgId: { filter: (orgId: OrgId) => Iterable<JoinRequestRow> }
    }
    orgMember: (db: DB) => OrgMemberTableLike<MemberRow> & {
      id: {
        delete: (id: MemberId) => boolean
        find: (id: MemberId) => MemberRow | null
        update: (row: MemberRow) => MemberRow
      }
      orgId: { filter: (orgId: OrgId) => Iterable<MemberRow> }
      userId: object
    }
  }): Pick<
    OrgConfig<DB, OrgId, MemberId, InviteId, RequestId, Identity, OrgRow, MemberRow, InviteRow, JoinRequestRow>,
    | 'orgByUserIndex'
    | 'orgInviteByOrgIndex'
    | 'orgInviteByTokenIndex'
    | 'orgInvitePk'
    | 'orgInviteTable'
    | 'orgJoinRequestByOrgIndex'
    | 'orgJoinRequestByOrgStatusIndex'
    | 'orgJoinRequestPk'
    | 'orgJoinRequestTable'
    | 'orgMemberByOrgIndex'
    | 'orgMemberByUserIndex'
    | 'orgMemberPk'
    | 'orgMemberTable'
    | 'orgPk'
    | 'orgSlugIndex'
    | 'orgTable'
  > => ({
    orgByUserIndex: tbl => asRec(tbl).userId as Iterable<OrgRow>,
    orgInviteByOrgIndex: tbl =>
      wrapByOrgIndex(
        asRec(tbl) as unknown as Iterable<InviteRow> & { orgId: { filter: (orgId: OrgId) => Iterable<InviteRow> } }
      ),
    orgInviteByTokenIndex: tbl => asRec(tbl).token as Iterable<InviteRow>,
    orgInvitePk: tbl => asRec(tbl).id as OrgInvitePkLike<InviteRow, InviteId>,
    orgInviteTable: tables.orgInvite as (db: DB) => OrgInviteTableLike<InviteRow>,
    orgJoinRequestByOrgIndex: tbl =>
      wrapByOrgIndex(
        asRec(tbl) as unknown as Iterable<JoinRequestRow> & {
          orgId: { filter: (orgId: OrgId) => Iterable<JoinRequestRow> }
        }
      ),
    orgJoinRequestByOrgStatusIndex: tbl => {
      const table = asRec(tbl) as unknown as Iterable<JoinRequestRow> & {
        orgId: { filter: (orgId: OrgId) => Iterable<JoinRequestRow> }
      }
      return {
        filterByOrgStatus: (orgId: OrgId, status: string) => {
          const out: JoinRequestRow[] = []
          for (const row of table.orgId.filter(orgId)) if (row.status === status) out.push(row)
          return out
        },
        [Symbol.iterator]: () => table[Symbol.iterator]()
      }
    },
    orgJoinRequestPk: tbl => asRec(tbl).id as OrgJoinRequestPkLike<JoinRequestRow, RequestId>,
    orgJoinRequestTable: tables.orgJoinRequest as (db: DB) => OrgJoinRequestTableLike<JoinRequestRow>,
    orgMemberByOrgIndex: tbl =>
      wrapByOrgIndex(
        asRec(tbl) as unknown as Iterable<MemberRow> & { orgId: { filter: (orgId: OrgId) => Iterable<MemberRow> } }
      ),
    orgMemberByUserIndex: tbl => asRec(tbl).userId as Iterable<MemberRow>,
    orgMemberPk: tbl => asRec(tbl).id as OrgMemberPkLike<MemberRow, MemberId>,
    orgMemberTable: tables.orgMember as (db: DB) => OrgMemberTableLike<MemberRow>,
    orgPk: tbl => asRec(tbl).id as OrgPkLike<OrgRow, OrgId>,
    orgSlugIndex: tbl => asRec(tbl).slug as Iterable<OrgRow>,
    orgTable: tables.org as (db: DB) => Iterable<OrgRow> & { insert: (row: OrgRow) => OrgRow }
  })
export type {
  CascadeTableConfig,
  InviteDocLike,
  JoinRequestItem,
  OrgByUserIndexLike,
  OrgConfig,
  OrgDocLike,
  OrgExports,
  OrgFieldBuilders,
  OrgInviteByOrgIndexLike,
  OrgJoinRequestByOrgIndexLike,
  OrgMemberByOrgIndexLike,
  OrgMemberItem,
  OrgSlugIndexLike,
  OrgUserLike
}
export type { OrgInviteRowLike } from './org-invites'
export type { OrgJoinRequestRowLike } from './org-join'
export type { OrgMemberRowLike, OrgRowLike } from './org-members'
export { makeOrg, makeOrgTables }
