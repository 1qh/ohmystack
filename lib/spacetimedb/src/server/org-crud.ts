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
}
const canEdit = ({
  acl,
  member,
  row,
  sender
}: {
  acl?: boolean
  member: { isAdmin: boolean }
  row: { editors?: Identity[]; userId: Identity }
  sender: Identity
}): boolean => {
  if (member.isAdmin) return true
  if (identityEquals(row.userId, sender)) return true
  if (acl && row.editors) for (const e of row.editors) if (identityEquals(e, sender)) return true
  return false
}
const requireCanMutate = ({
  acl,
  member,
  operation,
  row,
  sender,
  tableName
}: {
  acl?: boolean
  member: { isAdmin: boolean }
  operation: string
  row: { editors?: Identity[]; userId: Identity }
  sender: Identity
  tableName: string
}) => {
  if (!canEdit({ acl, member, row, sender })) throw makeError('FORBIDDEN', `${tableName}:${operation}`)
}
const getOrgOwnedRow = <
  OrgId,
  Row extends OrgCrudOwnedRow<OrgId>,
  Id,
  Tbl extends OrgCrudTableLike<Row>,
  Pk extends OrgCrudPkLike<Row, Id>,
  Member extends OrgCrudMemberLike<OrgId>
>({
  acl,
  id,
  isOwner,
  operation,
  orgMemberTable,
  pkAccessor,
  sender,
  table,
  tableName
}: {
  acl?: boolean
  id: Id
  isOwner?: (orgId: OrgId) => boolean
  operation: string
  orgMemberTable: Iterable<Member>
  pkAccessor: (table: Tbl) => Pk
  sender: Identity
  table: Tbl
  tableName: string
}): { member: Member; pk: Pk; row: Row } => {
  const pk = pkAccessor(table)
  const row = pk.find(id)
  if (!row) throw makeError('NOT_FOUND', `${tableName}:${operation}`)
  let member = checkMembership(orgMemberTable, row.orgId, sender)
  if (!member && isOwner?.(row.orgId))
    member = {
      isAdmin: true,
      orgId: row.orgId,
      userId: sender
    } as unknown as Member
  if (!member) throw makeError('NOT_ORG_MEMBER', `${tableName}:${operation}`)
  requireCanMutate({ acl, member, operation, row: row as { editors?: Identity[]; userId: Identity }, sender, tableName })
  return { member, pk, row }
}
const deleteCascadeChildren = (
  db: Record<string, unknown>,
  cascade: { foreignKey: string; table: string },
  id: unknown
) => {
  const childTableObj = db[cascade.table]
  const fk = cascade.foreignKey
  if (!childTableObj) return
  const childRows: Record<string, unknown>[] = []
  const tbl = childTableObj as Iterable<Record<string, unknown>> & {
    iter?: () => Iterable<Record<string, unknown>>
  }
  const iter = typeof tbl.iter === 'function' ? tbl.iter() : tbl
  for (const child of iter) if (Object.is(child[fk], id)) childRows.push(child)
  for (const child of childRows) (childTableObj as { id: { delete: (v: unknown) => boolean } }).id.delete(child.id)
}
/** Creates org-scoped CRUD reducers with membership and ACL checks.
 * @param spacetimedb - SpacetimeDB reducer factory
 * @param config - Org CRUD configuration
 * @returns Reducer export map
 */
const makeOrgCrud = <
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
    isOrgOwner: isOrgOwnerFn,
    options,
    orgIdField,
    orgMemberTable: orgMemberTableAccessor,
    pk: pkAccessor,
    table: tableAccessor,
    tableName
  } = config
  const useAcl = Boolean(options?.acl)
  const hooks = options?.hooks
  const requireMembershipOrOwner = ({
    db,
    operation,
    orgId,
    orgMemberTable: omt,
    sender
  }: {
    db: DB
    operation: string
    orgId: OrgId
    orgMemberTable: Iterable<Member>
    sender: Identity
  }): Member => {
    const member = checkMembership(omt, orgId, sender)
    if (member) return member
    if (isOrgOwnerFn?.(db, orgId, sender)) return { isAdmin: true, orgId, userId: sender } as unknown as Member
    throw makeError('NOT_ORG_MEMBER', `${tableName}:${operation}`)
  }
  const fieldNames = Object.keys(fields) as (keyof F & string)[]
  const createName = `create_${tableName}`
  const updateName = `update_${tableName}`
  const rmName = `rm_${tableName}`
  const updateParams: Record<string, TypeBuilder<unknown, AlgebraicTypeType>> = {
    id: idField
  }
  const optionalFields = makeOptionalFields(fields)
  const optionalKeys = Object.keys(optionalFields)
  for (const key of optionalKeys) {
    const field = optionalFields[key]
    if (field) updateParams[key] = field as TypeBuilder<unknown, AlgebraicTypeType>
  }
  if (expectedUpdatedAtField) updateParams.expectedUpdatedAt = expectedUpdatedAtField.optional()
  const createParams: Record<string, TypeBuilder<unknown, AlgebraicTypeType>> = { orgId: orgIdField }
  const fieldKeys = Object.keys(fields)
  for (const key of fieldKeys) createParams[key] = fields[key] as TypeBuilder<unknown, AlgebraicTypeType>
  const createReducer = spacetimedb.reducer({ name: createName }, createParams, (ctx, args) => {
    if (options?.rateLimit) enforceRateLimit(tableName, ctx.sender, options.rateLimit)
    const typedArgs = args as OrgCrudFieldValues<F> & { orgId: OrgId }
    const hookCtx = {
      db: ctx.db,
      sender: ctx.sender,
      timestamp: ctx.timestamp
    }
    const table = tableAccessor(ctx.db)
    const orgMemberTable = orgMemberTableAccessor(ctx.db)
    requireMembershipOrOwner({
      db: ctx.db,
      operation: 'create',
      orgId: typedArgs.orgId,
      orgMemberTable,
      sender: ctx.sender
    })
    let data = typedArgs
    if (hooks?.beforeCreate)
      data = hooks.beforeCreate(hookCtx, {
        data
      }) as unknown as OrgCrudFieldValues<F> & { orgId: OrgId }
    const { orgId, ...payload } = data as unknown as Record<string, unknown> & { orgId: OrgId }
    const row = table.insert({
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
  })
  const updateReducer = spacetimedb.reducer({ name: updateName }, updateParams, (ctx, args) => {
    const typedArgs = args as UpdateArgs<F, Id>
    const hookCtx = {
      db: ctx.db,
      sender: ctx.sender,
      timestamp: ctx.timestamp
    }
    const table = tableAccessor(ctx.db)
    const orgMemberTable = orgMemberTableAccessor(ctx.db)
    const { pk, row } = getOrgOwnedRow({
      acl: useAcl,
      id: typedArgs.id,
      isOwner: isOrgOwnerFn ? (oid: unknown) => isOrgOwnerFn(ctx.db, oid as OrgId, ctx.sender) : undefined,
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
    const prev = row as unknown as Row
    const next = pk.update(applyPatch(prev, patch, ctx.timestamp)) as unknown as Row
    if (hooks?.afterUpdate)
      /** biome-ignore lint/nursery/noFloatingPromises: SpacetimeDB reducers are synchronous */
      hooks.afterUpdate(hookCtx, {
        next,
        patch: patch as unknown as Partial<OrgCrudFieldValues<F>>,
        prev
      })
  })
  const rmReducer = spacetimedb.reducer({ name: rmName }, { id: idField }, (ctx, args) => {
    const { id } = args as { id: Id }
    const hookCtx = {
      db: ctx.db,
      sender: ctx.sender,
      timestamp: ctx.timestamp
    }
    const table = tableAccessor(ctx.db)
    const orgMemberTable = orgMemberTableAccessor(ctx.db)
    const { pk, row } = getOrgOwnedRow({
      acl: useAcl,
      id,
      isOwner: isOrgOwnerFn ? (oid: unknown) => isOrgOwnerFn(ctx.db, oid as OrgId, ctx.sender) : undefined,
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
      if (options?.cascade) deleteCascadeChildren(ctx.db as Record<string, unknown>, options.cascade, id)
      const deleted = pk.delete(id)
      if (!deleted) throw makeError('NOT_FOUND', `${tableName}:rm`)
    }
    if (hooks?.afterDelete)
      /** biome-ignore lint/nursery/noFloatingPromises: SpacetimeDB reducers are synchronous */
      hooks.afterDelete(hookCtx, { row: row as unknown as Row })
  })
  const exportsRecord: Record<string, unknown> = {
    [createName]: createReducer,
    [rmName]: rmReducer,
    [updateName]: updateReducer
  }
  if (useAcl) {
    const addEditorName = `add_editor_${tableName}`
    const removeEditorName = `remove_editor_${tableName}`
    const setEditorsName = `set_editors_${tableName}`
    exportsRecord[addEditorName] = spacetimedb.reducer(
      { name: addEditorName },
      { editorId: config.fields.userId as TypeBuilder<unknown, AlgebraicTypeType>, id: idField },
      (ctx, args) => {
        const { editorId, id } = args as { editorId: Identity; id: Id }
        const table = tableAccessor(ctx.db)
        const orgMemberTable = orgMemberTableAccessor(ctx.db)
        const { member, pk, row } = getOrgOwnedRow({
          acl: true,
          id,
          isOwner: isOrgOwnerFn ? (oid: unknown) => isOrgOwnerFn(ctx.db, oid as OrgId, ctx.sender) : undefined,
          operation: 'addEditor',
          orgMemberTable,
          pkAccessor: pkAccessor as never,
          sender: ctx.sender,
          table: table as never,
          tableName
        })
        if (!(member.isAdmin || identityEquals(row.userId, ctx.sender)))
          throw makeError('FORBIDDEN', `${tableName}:addEditor`)
        const editors = ((row as Record<string, unknown>).editors as Identity[] | undefined) ?? []
        for (const e of editors) if (identityEquals(e, editorId)) return
        pk.update({ ...row, editors: [...editors, editorId], updatedAt: ctx.timestamp } as never)
      }
    )
    exportsRecord[removeEditorName] = spacetimedb.reducer(
      { name: removeEditorName },
      { editorId: config.fields.userId as TypeBuilder<unknown, AlgebraicTypeType>, id: idField },
      (ctx, args) => {
        const { editorId, id } = args as { editorId: Identity; id: Id }
        const table = tableAccessor(ctx.db)
        const orgMemberTable = orgMemberTableAccessor(ctx.db)
        const { member, pk, row } = getOrgOwnedRow({
          acl: true,
          id,
          isOwner: isOrgOwnerFn ? (oid: unknown) => isOrgOwnerFn(ctx.db, oid as OrgId, ctx.sender) : undefined,
          operation: 'removeEditor',
          orgMemberTable,
          pkAccessor: pkAccessor as never,
          sender: ctx.sender,
          table: table as never,
          tableName
        })
        if (!(member.isAdmin || identityEquals(row.userId, ctx.sender)))
          throw makeError('FORBIDDEN', `${tableName}:removeEditor`)
        const editors = ((row as Record<string, unknown>).editors as Identity[] | undefined) ?? []
        pk.update({
          ...row,
          editors: editors.filter(e => !identityEquals(e, editorId)),
          updatedAt: ctx.timestamp
        } as never)
      }
    )
    exportsRecord[setEditorsName] = spacetimedb.reducer(
      { name: setEditorsName },
      { editorIds: config.fields.userId as TypeBuilder<unknown, AlgebraicTypeType>, id: idField },
      (ctx, args) => {
        const { editorIds, id } = args as { editorIds: Identity[]; id: Id }
        const table = tableAccessor(ctx.db)
        const orgMemberTable = orgMemberTableAccessor(ctx.db)
        const { member, pk, row } = getOrgOwnedRow({
          acl: true,
          id,
          isOwner: isOrgOwnerFn ? (oid: unknown) => isOrgOwnerFn(ctx.db, oid as OrgId, ctx.sender) : undefined,
          operation: 'setEditors',
          orgMemberTable,
          pkAccessor: pkAccessor as never,
          sender: ctx.sender,
          table: table as never,
          tableName
        })
        if (!(member.isAdmin || identityEquals(row.userId, ctx.sender)))
          throw makeError('FORBIDDEN', `${tableName}:setEditors`)
        pk.update({ ...row, editors: editorIds, updatedAt: ctx.timestamp } as never)
      }
    )
  }
  return {
    exports: exportsRecord as unknown as OrgCrudExports['exports']
  }
}
/** Defines a cascade delete relation for org-scoped tables. */
const orgCascade = <S extends ZodRawShape, N extends string>(
  schema: ZodObject<S> & { readonly __name: N },
  config: { foreignKey: keyof S & string }
): { foreignKey: string; table: N } => ({ foreignKey: config.foreignKey, table: schema.__name })
export { checkMembership, makeOrgCrud, orgCascade }
