import type { Identity, Timestamp } from 'spacetimedb'

import type {
  SingletonConfig,
  SingletonExports,
  SingletonFieldBuilders,
  SingletonFieldValues,
  SingletonTableLike
} from './types/singleton'

import { applyPatch, identityEquals, makeError, makeOptionalFields, pickPatch } from './reducer-utils'

interface SingletonRow {
  createdAt: Timestamp
  updatedAt: Timestamp
  userId: Identity
}

const findByUser = (table: SingletonTableLike<SingletonRow>, sender: Identity): null | SingletonRow => {
    for (const row of table) if (identityEquals(row.userId, sender)) return row

    return null
  },
  /** Generates get and upsert reducers for a per-user singleton table. */
  makeSingletonCrud = <
    DB,
    F extends SingletonFieldBuilders,
    Row extends SingletonRow,
    Tbl extends SingletonTableLike<Row>
  >(
    spacetimedb: {
      reducer: (
        opts: { name: string },
        params: SingletonFieldBuilders,
        fn: (ctx: { db: DB; sender: Identity; timestamp: Timestamp }, args: unknown) => void
      ) => unknown
    },
    config: SingletonConfig<DB, F, Row, Tbl>
  ): SingletonExports => {
    const { fields, options, table: tableAccessor, tableName } = config,
      hooks = options?.hooks,
      fieldNames = Object.keys(fields) as (keyof F & string)[],
      getName = `get_${tableName}`,
      upsertName = `upsert_${tableName}`,
      upsertParams: SingletonFieldBuilders = {},
      optionalFields = makeOptionalFields(fields),
      optionalKeys = Object.keys(optionalFields)

    for (const key of optionalKeys) {
      const field = optionalFields[key]
      if (field) upsertParams[key] = field
    }

    const getReducer = spacetimedb.reducer({ name: getName }, {}, ctx => {
        const table = tableAccessor(ctx.db),
          row = findByUser(table as unknown as SingletonTableLike<SingletonRow>, ctx.sender)
        if (!row) throw makeError('NOT_FOUND', `${tableName}:get`)
        if (hooks?.beforeRead)
          /** biome-ignore lint/nursery/noFloatingPromises: SpacetimeDB reducers are synchronous */
          hooks.beforeRead({ db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp }, { row: row as unknown as Row })
      }),
      upsertReducer = spacetimedb.reducer({ name: upsertName }, upsertParams, (ctx, args) => {
        const typedArgs = args as Partial<SingletonFieldValues<F>>,
          hookCtx = { db: ctx.db, sender: ctx.sender, timestamp: ctx.timestamp },
          table = tableAccessor(ctx.db),
          existing = findByUser(table as unknown as SingletonTableLike<SingletonRow>, ctx.sender),
          patchRecord = typedArgs as Record<string, unknown>

        if (existing) {
          if (hooks?.beforeUpdate)
            /** biome-ignore lint/nursery/noFloatingPromises: SpacetimeDB reducers are synchronous */
            hooks.beforeUpdate(hookCtx, {
              patch: patchRecord as unknown as Partial<SingletonFieldValues<F>>,
              prev: existing as unknown as Row
            })
          const filteredPatch = pickPatch(patchRecord, fieldNames),
            nextRecord = applyPatch(
              existing as unknown as Record<string, unknown>,
              filteredPatch,
              ctx.timestamp
            ) as unknown as Row
          table.update(nextRecord)
          if (hooks?.afterUpdate)
            /** biome-ignore lint/nursery/noFloatingPromises: SpacetimeDB reducers are synchronous */
            hooks.afterUpdate(hookCtx, {
              next: nextRecord,
              patch: patchRecord as unknown as Partial<SingletonFieldValues<F>>,
              prev: existing as unknown as Row
            })
        } else {
          if (hooks?.beforeCreate)
            /** biome-ignore lint/nursery/noFloatingPromises: SpacetimeDB reducers are synchronous */
            hooks.beforeCreate(hookCtx, { data: patchRecord as unknown as Partial<SingletonFieldValues<F>> })
          const newRow = { ...patchRecord, createdAt: ctx.timestamp, updatedAt: ctx.timestamp, userId: ctx.sender } as Row
          table.insert(newRow)
          if (hooks?.afterCreate)
            /** biome-ignore lint/nursery/noFloatingPromises: SpacetimeDB reducers are synchronous */
            hooks.afterCreate(hookCtx, {
              data: patchRecord as unknown as Partial<SingletonFieldValues<F>>,
              row: newRow
            })
        }
      }),
      exportsRecord = {
        [getName]: getReducer,
        [upsertName]: upsertReducer
      } as unknown as SingletonExports['exports']

    return {
      exports: exportsRecord
    }
  }

export { makeSingletonCrud }
