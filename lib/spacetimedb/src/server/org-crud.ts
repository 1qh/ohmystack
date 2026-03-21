import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, TypeBuilder } from 'spacetimedb/server'
import type { ZodObject, ZodRawShape } from 'zod/v4'
import type {
  OrgCrudConfig,
  OrgCrudExports,
  OrgCrudFieldBuilders,
  OrgCrudFieldValues,
  OrgCrudMemberLike,
  OrgCrudOwnedRow,
  OrgCrudPkLike,
  OrgCrudTableLike
} from './types/org-crud'
import { enforceRateLimit } from './helpers'
import { applyPatch, identityEquals, makeError, makeOptionalFields, pickPatch, timestampEquals } from './reducer-utils'
type UpdateArgs<F extends OrgCrudFieldBuilders, Id> = Partial<OrgCrudFieldValues<F>> & {
  expectedUpdatedAt?: Timestamp
  id: Id
}
const checkMembership = <OrgId, Member extends OrgCrudMemberLike<OrgId>>(
    orgMemberTable: Iterable<Member>,
    orgId: OrgId,
    sender: Identity
  ): Member | null => {
    for (const member of orgMemberTable)
      if (Object.is(member.orgId, orgId) && identityEquals(member.userId, sender)) return member
    return null
  },
  requireMembership = <OrgId, Member extends OrgCrudMemberLike<OrgId>>({
    operation,
    orgId,
    orgMemberTable,
    sender,
    tableName
  }: {
    operation: string
    orgId: OrgId
    orgMemberTable: Iterable<Member>
    sender: Identity
    tableName: string
  }): Member => {
    const member = checkMembership(orgMemberTable, orgId, sender)
    if (!member) throw makeError('NOT_ORG_MEMBER', `${tableName}:${operation}`)
    return member
  },
  canEdit = ({
    member,
    row,
    sender
  }: {
    member: { isAdmin: boolean }
    row: { userId: Identity }
    sender: Identity
  }): boolean => member.isAdmin || identityEquals(row.userId, sender),
  requireCanMutate = ({
    member,
    operation,
    row,
    sender,
    tableName
  }: {
    member: { isAdmin: boolean }
    operation: string
    row: { userId: Identity }
    sender: Identity
    tableName: string
  }) => {
    if (!canEdit({ member, row, sender })) throw makeError('FORBIDDEN', `${tableName}:${operation}`)
  },
  getOrgOwnedRow = <
    OrgId,
    Row extends OrgCrudOwnedRow<OrgId>,
    Id,
    Tbl extends OrgCrudTableLike<Row>,
    Pk extends OrgCrudPkLike<Row, Id>,
    Member extends OrgCrudMemberLike<OrgId>
  >({
    id,
    operation,
    orgMemberTable,
    pkAccessor,
    sender,
    table,
    tableName
  }: {
    id: Id
    operation: string
    orgMemberTable: Iterable<Member>
    pkAccessor: (table: Tbl) => Pk
    sender: Identity
    table: Tbl
    tableName: string
  }): { member: Member; pk: Pk; row: Row } => {
    const pk = pkAccessor(table),
      row = pk.find(id)
    if (!row) throw makeError('NOT_FOUND', `${tableName}:${operation}`)
    const member = requireMembership({ operation, orgId: row.orgId, orgMemberTable, sender, tableName })
    requireCanMutate({ member, operation, row, sender, tableName })
    return { member, pk, row }
  },
  /** Creates org-scoped CRUD reducers with membership and ACL checks.
   * @param spacetimedb - SpacetimeDB reducer factory
   * @param config - Org CRUD configuration
   * @returns Reducer export map
   */
  makeOrgCrud = <
    DB,
    F extends OrgCrudFieldBuilders,
    OrgId,
    Row extends OrgCrudOwnedRow<OrgId>,
    Id,
    Tbl extends OrgCrudTableLike<Row>,
    Pk extends OrgCrudPkLike<Row, Id>,
    Member extends OrgCrudMemberLike<OrgId>,
    OrgMemberTbl extends Iterable<Member>
  >(
    spacetimedb: {
      reducer: (
        opts: { name: string },
        params: OrgCrudFieldBuilders,
        fn: (ctx: { db: DB; sender: Identity; timestamp: Timestamp }, args: unknown) => void
      ) => unknown
    },
    config: OrgCrudConfig<DB, F, OrgId, Row, Id, Tbl, Pk, Member, OrgMemberTbl>
  ): OrgCrudExports => {
    const {
        expectedUpdatedAtField,
        fields,
        idField,
        options,
        orgIdField,
        orgMemberTable: orgMemberTableAccessor,
        pk: pkAccessor,
        table: tableAccessor,
        tableName
      } = config,
      hooks = options?.hooks,
      fieldNames = Object.keys(fields) as (keyof F & string)[],
      createName = `create_${tableName}`,
      updateName = `update_${tableName}`,
      rmName = `rm_${tableName}`,
      updateParams: Record<string, TypeBuilder<unknown, AlgebraicTypeType>> = {
        id: idField
      },
      optionalFields = makeOptionalFields(fields),
      optionalKeys = Object.keys(optionalFields)
    for (const key of optionalKeys) {
      const field = optionalFields[key]
      if (field) updateParams[key] = field as TypeBuilder<unknown, AlgebraicTypeType>
    }
    if (expectedUpdatedAtField) updateParams.expectedUpdatedAt = expectedUpdatedAtField.optional()
    const createParams: Record<string, TypeBuilder<unknown, AlgebraicTypeType>> = { orgId: orgIdField },
      fieldKeys = Object.keys(fields)
    for (const key of fieldKeys) createParams[key] = fields[key] as TypeBuilder<unknown, AlgebraicTypeType>
    const createReducer = spacetimedb.reducer({ name: createName }, createParams, (ctx, args) => {
        if (options?.rateLimit) enforceRateLimit(tableName, ctx.sender, options.rateLimit)
        const typedArgs = args as OrgCrudFieldValues<F> & { orgId: OrgId },
          hookCtx = { db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp },
          table = tableAccessor(ctx.db),
          orgMemberTable = orgMemberTableAccessor(ctx.db)
        requireMembership({
          operation: 'create',
          orgId: typedArgs.orgId,
          orgMemberTable,
          sender: ctx.sender,
          tableName
        })
        let data = typedArgs
        if (hooks?.beforeCreate)
          data = hooks.beforeCreate(hookCtx, { data }) as unknown as OrgCrudFieldValues<F> & { orgId: OrgId }
        const { orgId, ...payload } = data as unknown as Record<string, unknown> & { orgId: OrgId },
          row = table.insert({
            ...payload,
            createdAt: ctx.timestamp,
            id: 0 as Id,
            orgId,
            updatedAt: ctx.timestamp,
            userId: ctx.sender
          } as unknown as Row)
        if (hooks?.afterCreate)
          /** biome-ignore lint/nursery/noFloatingPromises: SpacetimeDB reducers are synchronous */
          hooks.afterCreate(hookCtx, { data, row })
      }),
      updateReducer = spacetimedb.reducer({ name: updateName }, updateParams, (ctx, args) => {
        const typedArgs = args as UpdateArgs<F, Id>,
          hookCtx = { db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp },
          table = tableAccessor(ctx.db),
          orgMemberTable = orgMemberTableAccessor(ctx.db),
          { pk, row } = getOrgOwnedRow({
            id: typedArgs.id,
            operation: 'update',
            orgMemberTable,
            pkAccessor: pkAccessor as unknown as (
              tbl: OrgCrudTableLike<OrgCrudOwnedRow<unknown>>
            ) => OrgCrudPkLike<OrgCrudOwnedRow<unknown>, Id>,
            sender: ctx.sender,
            table: table as unknown as OrgCrudTableLike<OrgCrudOwnedRow<unknown>>,
            tableName
          })
        if (typedArgs.expectedUpdatedAt !== undefined && !timestampEquals(row.updatedAt, typedArgs.expectedUpdatedAt))
          throw makeError('CONFLICT', `${tableName}:update`)
        let patch = pickPatch(typedArgs as unknown as Record<string, unknown>, fieldNames)
        if (hooks?.beforeUpdate)
          patch = hooks.beforeUpdate(hookCtx, {
            patch: patch as unknown as Partial<OrgCrudFieldValues<F>>,
            prev: row as unknown as Row
          }) as unknown as Record<string, unknown>
        const prev = row as unknown as Row,
          next = pk.update(applyPatch(prev, patch, ctx.timestamp)) as unknown as Row
        if (hooks?.afterUpdate)
          /** biome-ignore lint/nursery/noFloatingPromises: SpacetimeDB reducers are synchronous */
          hooks.afterUpdate(hookCtx, {
            next,
            patch: patch as unknown as Partial<OrgCrudFieldValues<F>>,
            prev
          })
      }),
      rmReducer = spacetimedb.reducer({ name: rmName }, { id: idField }, (ctx, args) => {
        const { id } = args as { id: Id },
          hookCtx = { db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp },
          table = tableAccessor(ctx.db),
          orgMemberTable = orgMemberTableAccessor(ctx.db),
          { pk, row } = getOrgOwnedRow({
            id,
            operation: 'rm',
            orgMemberTable,
            pkAccessor: pkAccessor as unknown as (
              tbl: OrgCrudTableLike<OrgCrudOwnedRow<unknown>>
            ) => OrgCrudPkLike<OrgCrudOwnedRow<unknown>, Id>,
            sender: ctx.sender,
            table: table as unknown as OrgCrudTableLike<OrgCrudOwnedRow<unknown>>,
            tableName
          })
        if (hooks?.beforeDelete)
          /** biome-ignore lint/nursery/noFloatingPromises: SpacetimeDB reducers are synchronous */
          hooks.beforeDelete(hookCtx, { row: row as unknown as Row })
        if (options?.softDelete) {
          const nextRecord = {
            ...(row as unknown as Record<string, unknown>),
            deletedAt: ctx.timestamp,
            updatedAt: ctx.timestamp
          }
          pk.update(nextRecord as unknown as Row)
        } else {
          const deleted = pk.delete(id)
          if (!deleted) throw makeError('NOT_FOUND', `${tableName}:rm`)
        }
        if (hooks?.afterDelete)
          /** biome-ignore lint/nursery/noFloatingPromises: SpacetimeDB reducers are synchronous */
          hooks.afterDelete(hookCtx, { row: row as unknown as Row })
      }),
      exportsRecord = {
        [createName]: createReducer,
        [rmName]: rmReducer,
        [updateName]: updateReducer
      } as unknown as OrgCrudExports['exports']
    return {
      exports: exportsRecord
    }
  },
  /** Defines a cascade delete relation for org-scoped tables. */
  orgCascade = <S extends ZodRawShape>(
    _schema: ZodObject<S>,
    config: { foreignKey: keyof S & string; table: string }
  ): { foreignKey: string; table: string } => config
export { checkMembership, makeOrgCrud, orgCascade }
