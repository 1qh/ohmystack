import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, ReducerExport, TypeBuilder } from 'spacetimedb/server'

import { identityEquals, makeError } from './reducer-utils'
interface OptionalBuilder {
  optional: () => TypeBuilder<unknown, AlgebraicTypeType>
}
interface OrgJoinReducersConfig<
  DB,
  OrgId,
  MemberId,
  RequestId,
  OrgRow extends OrgRowLike<OrgId>,
  MemberRow extends OrgMemberRowLike<MemberId, OrgId>,
  JoinRequestRow extends OrgJoinRequestRowLike<RequestId, OrgId>
> {
  builders: {
    isAdmin: TypeBuilder<boolean, AlgebraicTypeType>
    message: OptionalBuilder
    orgId: TypeBuilder<OrgId, AlgebraicTypeType>
    requestId: TypeBuilder<RequestId, AlgebraicTypeType>
  }
  orgJoinRequestByOrgStatusIndex: (
    table: OrgJoinRequestTableLike<JoinRequestRow>
  ) => OrgJoinRequestByOrgStatusIndexLike<JoinRequestRow, OrgId>
  orgJoinRequestPk: (table: OrgJoinRequestTableLike<JoinRequestRow>) => OrgJoinRequestPkLike<JoinRequestRow, RequestId>
  orgJoinRequestTable: (db: DB) => OrgJoinRequestTableLike<JoinRequestRow>
  orgMemberTable: (db: DB) => OrgMemberTableLike<MemberRow>
  orgPk: (table: Iterable<OrgRow>) => OrgPkLike<OrgRow, OrgId>
  orgTable: (db: DB) => Iterable<OrgRow>
}
interface OrgJoinReducersExports {
  exports: Record<string, ReducerExport<never, never>>
}
interface OrgJoinRequestByOrgStatusIndexLike<Row, OrgId> extends Iterable<Row> {
  filterByOrgStatus: (orgId: OrgId, status: string) => Iterable<Row>
}
interface OrgJoinRequestPkLike<Row, Id> {
  delete: (id: Id) => boolean
  find: (id: Id) => null | Row
  update: (row: Row) => Row
}
interface OrgJoinRequestRowLike<RequestId, OrgId> {
  createdAt: Timestamp
  id: RequestId
  message: string | undefined
  orgId: OrgId
  status: string
  updatedAt: Timestamp
  userId: Identity
}
interface OrgJoinRequestTableLike<Row> extends Iterable<Row> {
  insert: (row: Row) => Row
}
interface OrgMemberRowLike<MemberId, OrgId> {
  createdAt: Timestamp
  id: MemberId
  isAdmin: boolean
  orgId: OrgId
  updatedAt: Timestamp
  userId: Identity
}
interface OrgMemberTableLike<Row> extends Iterable<Row> {
  insert: (row: Row) => Row
}
interface OrgPkLike<Row, Id> {
  find: (id: Id) => null | Row
}
type OrgRole = 'admin' | 'member' | 'owner'
interface OrgRowLike<OrgId> {
  id: OrgId
  userId: Identity
}
const findOrgMember = <OrgId, MemberId, MemberRow extends OrgMemberRowLike<MemberId, OrgId>>(
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
  requireAdminRole = <OrgId, MemberId>({
    operation,
    org,
    orgMemberTable,
    sender
  }: {
    operation: string
    org: OrgRowLike<OrgId>
    orgMemberTable: Iterable<OrgMemberRowLike<MemberId, OrgId>>
    sender: Identity
  }) => {
    const member = findOrgMember(orgMemberTable, org.id, sender),
      role = getRole(org, member, sender)
    if (!role) throw makeError('NOT_ORG_MEMBER', `org:${operation}`)
    if (role === 'member') throw makeError('FORBIDDEN', `org:${operation}`)
  },
  findPendingJoinRequestByUser = <RequestId, OrgId, JoinRequestRow extends OrgJoinRequestRowLike<RequestId, OrgId>>(
    byOrgStatusIndex: OrgJoinRequestByOrgStatusIndexLike<JoinRequestRow, OrgId>,
    orgId: OrgId,
    userId: Identity
  ): JoinRequestRow | null => {
    const pendingRequests = byOrgStatusIndex.filterByOrgStatus(orgId, 'pending')
    for (const request of pendingRequests) if (identityEquals(request.userId, userId)) return request
    return null
  },
  makeJoinReducers = <
    DB,
    OrgId,
    MemberId,
    RequestId,
    OrgRow extends OrgRowLike<OrgId>,
    MemberRow extends OrgMemberRowLike<MemberId, OrgId>,
    JoinRequestRow extends OrgJoinRequestRowLike<RequestId, OrgId>
  >(
    spacetimedb: {
      reducer: (
        opts: { name: string },
        params: Record<string, TypeBuilder<unknown, AlgebraicTypeType>>,
        fn: (ctx: { db: DB; sender: Identity; timestamp: Timestamp }, args: Record<string, unknown>) => void
      ) => ReducerExport<never, never>
    },
    config: OrgJoinReducersConfig<DB, OrgId, MemberId, RequestId, OrgRow, MemberRow, JoinRequestRow>
  ): OrgJoinReducersExports => {
    const requestJoinReducer = spacetimedb.reducer(
        { name: 'org_request_join' },
        {
          message: config.builders.message.optional(),
          orgId: config.builders.orgId
        },
        (ctx, _args: Record<string, unknown>) => {
          const args = _args as { message?: string; orgId: OrgId },
            orgTable = config.orgTable(ctx.db),
            orgPk = config.orgPk(orgTable),
            orgMemberTable = config.orgMemberTable(ctx.db),
            orgJoinRequestTable = config.orgJoinRequestTable(ctx.db),
            joinByOrgStatusIndex = config.orgJoinRequestByOrgStatusIndex(orgJoinRequestTable),
            org = orgPk.find(args.orgId)
          if (!org) throw makeError('NOT_FOUND', 'org:request_join')
          if (identityEquals(org.userId, ctx.sender)) throw makeError('ALREADY_ORG_MEMBER', 'org:request_join')
          const existingMember = findOrgMember(orgMemberTable, args.orgId, ctx.sender)
          if (existingMember) throw makeError('ALREADY_ORG_MEMBER', 'org:request_join')
          const existingRequest = findPendingJoinRequestByUser(joinByOrgStatusIndex, args.orgId, ctx.sender)
          if (existingRequest) throw makeError('JOIN_REQUEST_EXISTS', 'org:request_join')
          orgJoinRequestTable.insert({
            createdAt: ctx.timestamp,
            id: 0 as RequestId,
            message: args.message,
            orgId: args.orgId,
            status: 'pending',
            updatedAt: ctx.timestamp,
            userId: ctx.sender
          } as JoinRequestRow)
        }
      ),
      approveJoinReducer = spacetimedb.reducer(
        { name: 'org_approve_join' },
        {
          isAdmin: config.builders.isAdmin.optional(),
          requestId: config.builders.requestId
        },
        (ctx, _args: Record<string, unknown>) => {
          const args = _args as { isAdmin?: boolean; requestId: RequestId },
            orgTable = config.orgTable(ctx.db),
            orgPk = config.orgPk(orgTable),
            orgMemberTable = config.orgMemberTable(ctx.db),
            orgJoinRequestTable = config.orgJoinRequestTable(ctx.db),
            orgJoinRequestPk = config.orgJoinRequestPk(orgJoinRequestTable),
            request = orgJoinRequestPk.find(args.requestId)
          if (!request) throw makeError('NOT_FOUND', 'org:approve_join')
          if (request.status !== 'pending') throw makeError('NOT_FOUND', 'org:approve_join')
          const org = orgPk.find(request.orgId)
          if (!org) throw makeError('NOT_FOUND', 'org:approve_join')
          requireAdminRole({ operation: 'approve_join', org, orgMemberTable, sender: ctx.sender })
          orgJoinRequestPk.update({
            ...(request as unknown as Record<string, unknown>),
            status: 'approved',
            updatedAt: ctx.timestamp
          } as JoinRequestRow)
          orgMemberTable.insert({
            createdAt: ctx.timestamp,
            id: 0 as MemberId,
            isAdmin: args.isAdmin ?? false,
            orgId: request.orgId,
            updatedAt: ctx.timestamp,
            userId: request.userId
          } as MemberRow)
        }
      ),
      rejectJoinReducer = spacetimedb.reducer(
        { name: 'org_reject_join' },
        { requestId: config.builders.requestId },
        (ctx, _args: Record<string, unknown>) => {
          const args = _args as { requestId: RequestId },
            orgTable = config.orgTable(ctx.db),
            orgPk = config.orgPk(orgTable),
            orgMemberTable = config.orgMemberTable(ctx.db),
            orgJoinRequestTable = config.orgJoinRequestTable(ctx.db),
            orgJoinRequestPk = config.orgJoinRequestPk(orgJoinRequestTable),
            request = orgJoinRequestPk.find(args.requestId)
          if (!request) throw makeError('NOT_FOUND', 'org:reject_join')
          if (request.status !== 'pending') throw makeError('NOT_FOUND', 'org:reject_join')
          const org = orgPk.find(request.orgId)
          if (!org) throw makeError('NOT_FOUND', 'org:reject_join')
          requireAdminRole({ operation: 'reject_join', org, orgMemberTable, sender: ctx.sender })
          orgJoinRequestPk.update({
            ...(request as unknown as Record<string, unknown>),
            status: 'rejected',
            updatedAt: ctx.timestamp
          } as JoinRequestRow)
        }
      ),
      cancelJoinReducer = spacetimedb.reducer(
        { name: 'org_cancel_join' },
        { requestId: config.builders.requestId },
        (ctx, _args: Record<string, unknown>) => {
          const args = _args as { requestId: RequestId },
            orgJoinRequestTable = config.orgJoinRequestTable(ctx.db),
            orgJoinRequestPk = config.orgJoinRequestPk(orgJoinRequestTable),
            request = orgJoinRequestPk.find(args.requestId)
          if (!request) throw makeError('NOT_FOUND', 'org:cancel_join')
          if (!identityEquals(request.userId, ctx.sender)) throw makeError('FORBIDDEN', 'org:cancel_join')
          if (request.status !== 'pending') throw makeError('NOT_FOUND', 'org:cancel_join')
          const removed = orgJoinRequestPk.delete(args.requestId)
          if (!removed) throw makeError('NOT_FOUND', 'org:cancel_join')
        }
      )
    return {
      exports: {
        org_approve_join: approveJoinReducer,
        org_cancel_join: cancelJoinReducer,
        org_reject_join: rejectJoinReducer,
        org_request_join: requestJoinReducer
      }
    }
  }
export type {
  OrgJoinReducersConfig,
  OrgJoinReducersExports,
  OrgJoinRequestByOrgStatusIndexLike,
  OrgJoinRequestPkLike,
  OrgJoinRequestRowLike,
  OrgJoinRequestTableLike,
  OrgMemberRowLike,
  OrgMemberTableLike,
  OrgPkLike,
  OrgRowLike
}
export { makeJoinReducers }
