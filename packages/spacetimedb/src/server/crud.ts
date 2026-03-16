import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, TypeBuilder } from 'spacetimedb/server'
import type { ZodObject, ZodRawShape } from 'zod/v4'

import type { OwnedRow, PkLike, TableLike } from './reducer-utils'
import type { CrudConfig, CrudExports, CrudFieldBuilders, CrudFieldValues, CrudPkLike, CrudTableLike } from './types/crud'

import { enforceRateLimit } from './helpers'
import { applyPatch, getOwnedRow, makeError, makeOptionalFields, pickPatch, timestampEquals } from './reducer-utils'

type UpdateArgs<F extends CrudFieldBuilders, Id> = Partial<CrudFieldValues<F>> & { expectedUpdatedAt?: Timestamp; id: Id }

/** Creates create/update/remove reducers for owned tables.
 * @param spacetimedb - SpacetimeDB reducer factory
 * @param config - CRUD reducer configuration
 * @returns Reducer export map
 * @example
 * ```ts
 * const reducers = makeCrud(spacetimedb, { tableName: 'post', fields, idField, pk, table })
 * ```
 */
const makeCrud = <
    DB,
    F extends CrudFieldBuilders,
    Row extends OwnedRow,
    Id,
    Tbl extends CrudTableLike<Row>,
    Pk extends CrudPkLike<Row, Id>
  >(
    spacetimedb: {
      reducer: (
        opts: { name: string },
        params: CrudFieldBuilders,
        fn: (ctx: { db: DB; sender: Identity; timestamp: Timestamp }, args: unknown) => void
      ) => unknown
    },
    config: CrudConfig<DB, F, Row, Id, Tbl, Pk>
  ): CrudExports => {
    const { expectedUpdatedAtField, fields, idField, options, pk: pkAccessor, table: tableAccessor, tableName } = config,
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

    const createReducer = spacetimedb.reducer({ name: createName }, fields, (ctx, args) => {
        if (options?.rateLimit) enforceRateLimit(tableName, ctx.sender, options.rateLimit)
        const typedArgs = args as CrudFieldValues<F>,
          hookCtx = { db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp },
          table = tableAccessor(ctx.db)
        let data = typedArgs
        if (hooks?.beforeCreate) data = hooks.beforeCreate(hookCtx, { data }) as unknown as CrudFieldValues<F>
        const payload = data as unknown as Record<string, unknown>,
          row = table.insert({
            ...payload,
            createdAt: ctx.timestamp,
            id: 0 as Id,
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
          /** biome-ignore lint/nursery/noFloatingPromises: SpacetimeDB reducers are synchronous */
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
      } as unknown as CrudExports['exports']

    return {
      exports: exportsRecord
    }
  },
  /** Defines a cascade delete relation for owned-table helpers. */
  ownedCascade = <S extends ZodRawShape>(
    _schema: ZodObject<S>,
    config: { foreignKey: keyof S & string; table: string }
  ): { foreignKey: string; table: string } => config

export { makeCrud, ownedCascade }
