import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, TypeBuilder } from 'spacetimedb/server'

import type { CrudConfig, CrudExports, CrudFieldBuilders, CrudFieldValues, CrudPkLike, CrudTableLike } from './crud'

type ChildConfig<
  DB,
  F extends CrudFieldBuilders,
  Row extends { updatedAt: Timestamp; userId: Identity },
  Id,
  Tbl extends CrudTableLike<Row>,
  Pk extends CrudPkLike<Row, Id>,
  ParentRow,
  ParentId,
  ParentTbl,
  ParentPk extends ChildParentPkLike<ParentRow, ParentId>
> = ChildCrudConfig<DB, F, Row, Id, Tbl, Pk, ParentRow, ParentId, ParentTbl, ParentPk>

interface ChildCrudConfig<
  DB,
  F extends CrudFieldBuilders,
  Row extends { updatedAt: Timestamp; userId: Identity },
  Id,
  Tbl extends CrudTableLike<Row>,
  Pk extends CrudPkLike<Row, Id>,
  ParentRow,
  ParentId,
  ParentTbl,
  ParentPk extends ChildParentPkLike<ParentRow, ParentId>
> extends CrudConfig<DB, F, Row, Id, Tbl, Pk> {
  foreignKeyField: TypeBuilder<ParentId, AlgebraicTypeType>
  foreignKeyName: string
  parentPk: (table: ParentTbl) => ParentPk
  parentTable: (db: DB) => ParentTbl
}

type ChildCrudExports = CrudExports

type ChildCrudResult = ChildCrudExports

interface ChildParentPkLike<Row, Id> {
  find: (id: Id) => null | Row
}

export type {
  ChildConfig,
  ChildCrudConfig,
  ChildCrudExports,
  ChildCrudResult,
  ChildParentPkLike,
  CrudFieldBuilders,
  CrudFieldValues,
  CrudPkLike,
  CrudTableLike
}
