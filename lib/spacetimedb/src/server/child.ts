import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, TypeBuilder } from 'spacetimedb/server'

import type { OwnedRow, PkLike, TableLike } from './reducer-utils'
import type {
  ChildCrudConfig,
  ChildCrudExports,
  ChildParentPkLike,
  CrudFieldBuilders,
  CrudFieldValues,
  CrudPkLike,
  CrudTableLike
} from './types/child'

import { enforceRateLimit } from './helpers'
import { applyPatch, getOwnedRow, makeError, makeOptionalFields, pickPatch, timestampEquals } from './reducer-utils'
type UpdateArgs<F extends CrudFieldBuilders, Id> = Partial<CrudFieldValues<F>> & { expectedUpdatedAt?: Timestamp; id: Id }
/** Creates owned child-table CRUD reducers with parent existence checks.
 * @param spacetimedb - SpacetimeDB reducer factory
 * @param config - Child CRUD configuration
 * @returns Reducer export map
 */
const makeChildCrud = <
  DB,
  F extends CrudFieldBuilders,
  Row extends OwnedRow,
  Id,
  Tbl extends CrudTableLike<Row>,
  Pk extends CrudPkLike<Row, Id>,
  ParentRow,
  ParentId,
  ParentTbl,
  ParentPk extends ChildParentPkLike<ParentRow, ParentId>
>(
  spacetimedb: {
    reducer: (
      opts: { name: string },
      params: CrudFieldBuilders,
      fn: (ctx: { db: DB; sender: Identity; timestamp: Timestamp }, args: unknown) => void
    ) => unknown
  },
  config: ChildCrudConfig<DB, F, Row, Id, Tbl, Pk, ParentRow, ParentId, ParentTbl, ParentPk>
): ChildCrudExports => {
  const {
      expectedUpdatedAtField,
      fields,
      foreignKeyField,
      foreignKeyName,
      idField,
      options,
      parentPk: parentPkAccessor,
      parentTable: parentTableAccessor,
      pk: pkAccessor,
      table: tableAccessor,
      tableName
    } = config,
    hooks = options?.hooks,
    fieldNames = Object.keys(fields) as (keyof F & string)[],
    createName = `create_${tableName}`,
    updateName = `update_${tableName}`,
    rmName = `rm_${tableName}`,
    createParams: CrudFieldBuilders = {
      [foreignKeyName]: foreignKeyField as TypeBuilder<unknown, AlgebraicTypeType>
    },
    createFieldKeys = Object.keys(fields),
    updateParams: Record<string, TypeBuilder<unknown, AlgebraicTypeType>> = {
      id: idField
    },
    optionalFields = makeOptionalFields(fields),
    optionalKeys = Object.keys(optionalFields)
  for (const key of createFieldKeys) {
    const field = fields[key]
    if (field) createParams[key] = field
  }
  for (const key of optionalKeys) {
    const field = optionalFields[key]
    if (field) updateParams[key] = field as TypeBuilder<unknown, AlgebraicTypeType>
  }
  if (expectedUpdatedAtField) updateParams.expectedUpdatedAt = expectedUpdatedAtField.optional()
  const createReducer = spacetimedb.reducer({ name: createName }, createParams, (ctx, args) => {
      if (options?.rateLimit) enforceRateLimit(tableName, ctx.sender, options.rateLimit)
      const typedArgs = args as CrudFieldValues<F> & Record<string, unknown>,
        hookCtx = { db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp },
        table = tableAccessor(ctx.db),
        parentId = typedArgs[foreignKeyName] as ParentId,
        parent = parentPkAccessor(parentTableAccessor(ctx.db)).find(parentId)
      if (!parent) throw makeError('NOT_FOUND', `${tableName}:create`)
      let data = typedArgs
      if (hooks?.beforeCreate)
        data = hooks.beforeCreate(hookCtx, { data }) as unknown as CrudFieldValues<F> & Record<string, unknown>
      const payload = data as unknown as Record<string, unknown>
      table.insert({
        ...payload,
        createdAt: ctx.timestamp,
        [foreignKeyName]: parentId,
        id: 0 as Id,
        updatedAt: ctx.timestamp,
        userId: ctx.sender
      } as unknown as Row)
    }),
    updateReducer = spacetimedb.reducer({ name: updateName }, updateParams, (ctx, args) => {
      const typedArgs = args as UpdateArgs<F, Id>,
        hookCtx = { db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp },
        table = tableAccessor(ctx.db),
        { pk, row } = getOwnedRow({
          ctxSender: ctx.sender,
          id: typedArgs.id,
          operation: 'update',
          pkAccessor: pkAccessor as unknown as (tbl: TableLike<OwnedRow>) => PkLike<OwnedRow, Id>,
          table: table as unknown as TableLike<OwnedRow>,
          tableName
        })
      if (typedArgs.expectedUpdatedAt !== undefined && !timestampEquals(row.updatedAt, typedArgs.expectedUpdatedAt))
        throw makeError('CONFLICT', `${tableName}:update`)
      let patch = pickPatch(typedArgs as unknown as Record<string, unknown>, fieldNames)
      if (hooks?.beforeUpdate)
        patch = hooks.beforeUpdate(hookCtx, {
          patch: patch as unknown as Partial<CrudFieldValues<F>>,
          prev: row as unknown as Row
        }) as unknown as Record<string, unknown>
      const prev = row as unknown as Row,
        next = pk.update(applyPatch(prev, patch, ctx.timestamp)) as unknown as Row
      if (hooks?.afterUpdate)
        hooks.afterUpdate(hookCtx, {
          next,
          patch: patch as unknown as Partial<CrudFieldValues<F>>,
          prev
        })
    }),
    rmReducer = spacetimedb.reducer({ name: rmName }, { id: idField }, (ctx, args) => {
      const { id } = args as { id: Id },
        hookCtx = { db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp },
        table = tableAccessor(ctx.db),
        { pk, row } = getOwnedRow({
          ctxSender: ctx.sender,
          id,
          operation: 'rm',
          pkAccessor: pkAccessor as unknown as (tbl: TableLike<OwnedRow>) => PkLike<OwnedRow, Id>,
          table: table as unknown as TableLike<OwnedRow>,
          tableName
        })
      if (hooks?.beforeDelete) hooks.beforeDelete(hookCtx, { row: row as unknown as Row })
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
      if (hooks?.afterDelete) hooks.afterDelete(hookCtx, { row: row as unknown as Row })
    }),
    exportsRecord = {
      [createName]: createReducer,
      [rmName]: rmReducer,
      [updateName]: updateReducer
    } as unknown as ChildCrudExports['exports']
  return {
    exports: exportsRecord
  }
}
export { makeChildCrud }
