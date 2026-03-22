import type { Identity, Timestamp } from "spacetimedb";
import type {
	AlgebraicTypeType,
	ColumnBuilder,
	ColumnMetadata,
	ReducerExport,
	TypeBuilder,
} from "spacetimedb/server";
import type { RateLimitConfig } from "./common";
import type { CrudHooks, HookCtx } from "./crud";

interface CanEditOpts {
	isAdmin: boolean;
	ownerId: Identity;
	userId: Identity;
}
type OrgCascadeTableConfig = string | { fileFields?: string[]; table: string };
type OrgCrudBuilder =
	| ColumnBuilder<unknown, AlgebraicTypeType, ColumnMetadata<unknown>>
	| TypeBuilder<unknown, AlgebraicTypeType>;
interface OrgCrudConfig<
	DB,
	F extends OrgCrudFieldBuilders,
	OrgId,
	Row extends OrgCrudOwnedRow<OrgId>,
	Id,
	Tbl extends OrgCrudTableLike<Row>,
	Pk extends OrgCrudPkLike<Row, Id>,
	Member extends OrgCrudMemberLike<OrgId>,
	OrgMemberTbl extends Iterable<Member>,
> {
	expectedUpdatedAtField?: TypeBuilder<Timestamp, AlgebraicTypeType>;
	fields: F;
	idField: TypeBuilder<Id, AlgebraicTypeType>;
	isOrgOwner?: (db: DB, orgId: OrgId, sender: Identity) => boolean;
	options?: OrgCrudOptions<
		DB,
		Row,
		OrgCrudFieldValues<F> & { orgId: OrgId },
		Partial<OrgCrudFieldValues<F>>
	>;
	orgIdField: TypeBuilder<OrgId, AlgebraicTypeType>;
	orgMemberTable: (db: DB) => OrgMemberTbl;
	pk: (table: Tbl) => Pk;
	table: (db: DB) => Tbl;
	tableName: string;
}
interface OrgCrudExports {
	exports: Record<string, ReducerExportLike>;
}
type OrgCrudFieldBuilders = Record<string, OrgCrudBuilder>;
type OrgCrudFieldValues<F extends OrgCrudFieldBuilders> = {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	[K in keyof F]: F[K] extends ColumnBuilder<infer T, infer _S, infer _M>
		? T
		: F[K] extends TypeBuilder<infer T, infer _S> // eslint-disable-line @typescript-eslint/no-unused-vars
			? T
			: never;
};
type OrgCrudMakeFn = <
	DB,
	F extends OrgCrudFieldBuilders,
	OrgId,
	Row extends OrgCrudOwnedRow<OrgId>,
	Id,
	Tbl extends OrgCrudTableLike<Row>,
	Pk extends OrgCrudPkLike<Row, Id>,
	Member extends OrgCrudMemberLike<OrgId>,
	OrgMemberTbl extends Iterable<Member>,
>(
	spacetimedb: {
		reducer: (
			opts: { name: string },
			params: OrgCrudFieldBuilders,
			fn: (ctx: HookCtx<DB>, args: Record<string, unknown>) => void,
		) => ReducerExportLike;
	},
	config: OrgCrudConfig<DB, F, OrgId, Row, Id, Tbl, Pk, Member, OrgMemberTbl>,
) => OrgCrudExports;
interface OrgCrudMemberLike<OrgId> {
	isAdmin: boolean;
	orgId: OrgId;
	userId: Identity;
}
interface OrgCrudOptions<
	DB = unknown,
	Row extends Record<string, unknown> = Record<string, unknown>,
	CreateArgs extends Record<string, unknown> = Record<string, unknown>,
	UpdatePatch extends Record<string, unknown> = Record<string, unknown>,
> {
	acl?: boolean;
	hooks?: CrudHooks<DB, Row, CreateArgs, UpdatePatch>;
	rateLimit?: RateLimitConfig;
	softDelete?: boolean;
}
interface OrgCrudOwnedRow<OrgId> extends Record<string, unknown> {
	orgId: OrgId;
	updatedAt: Timestamp;
	userId: Identity;
}
interface OrgCrudPkLike<Row, Id> {
	delete: (id: Id) => boolean;
	find: (id: Id) => null | Row;
	update: (row: Row) => Row;
}
type OrgCrudResult = OrgCrudExports;
interface OrgCrudTableLike<Row> {
	insert: (row: Row) => Row;
}
type ReducerExportLike = ReducerExport<never, never>;

export type {
	CanEditOpts,
	OrgCascadeTableConfig,
	OrgCrudConfig,
	OrgCrudExports,
	OrgCrudFieldBuilders,
	OrgCrudFieldValues,
	OrgCrudMakeFn,
	OrgCrudMemberLike,
	OrgCrudOptions,
	OrgCrudOwnedRow,
	OrgCrudPkLike,
	OrgCrudResult,
	OrgCrudTableLike,
};
