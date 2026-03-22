import type { Identity, Timestamp } from "spacetimedb";
import type {
	AlgebraicTypeType,
	ReducerExport,
	TypeBuilder,
} from "spacetimedb/server";
import { identityEquals, makeError } from "./reducer-utils";

type OrgInviteByTokenIndexLike<Row> = Iterable<Row>;
interface OrgInvitePkLike<Row, Id> {
	delete: (id: Id) => boolean;
	find: (id: Id) => null | Row;
}
interface OrgInviteReducersConfig<
	DB,
	OrgId,
	MemberId,
	InviteId,
	RequestId,
	OrgRow extends OrgRowLike<OrgId>,
	MemberRow extends OrgMemberRowLike<MemberId, OrgId>,
	InviteRow extends OrgInviteRowLike<InviteId, OrgId>,
	JoinRequestRow extends OrgJoinRequestRowLike<RequestId, OrgId>,
> {
	builders: {
		email: TypeBuilder<string, AlgebraicTypeType>;
		inviteId: TypeBuilder<InviteId, AlgebraicTypeType>;
		isAdmin: TypeBuilder<boolean, AlgebraicTypeType>;
		orgId: TypeBuilder<OrgId, AlgebraicTypeType>;
		token: TypeBuilder<string, AlgebraicTypeType>;
	};
	orgInviteByTokenIndex: (
		table: OrgInviteTableLike<InviteRow>,
	) => OrgInviteByTokenIndexLike<InviteRow>;
	orgInvitePk: (
		table: OrgInviteTableLike<InviteRow>,
	) => OrgInvitePkLike<InviteRow, InviteId>;
	orgInviteTable: (db: DB) => OrgInviteTableLike<InviteRow>;
	orgJoinRequestByOrgStatusIndex: (
		table: OrgJoinRequestTableLike<JoinRequestRow>,
	) => OrgJoinRequestByOrgStatusIndexLike<JoinRequestRow, OrgId>;
	orgJoinRequestPk: (
		table: OrgJoinRequestTableLike<JoinRequestRow>,
	) => OrgJoinRequestPkLike<JoinRequestRow>;
	orgJoinRequestTable: (db: DB) => OrgJoinRequestTableLike<JoinRequestRow>;
	orgMemberTable: (db: DB) => OrgMemberTableLike<MemberRow>;
	orgPk: (table: Iterable<OrgRow>) => OrgPkLike<OrgRow, OrgId>;
	orgTable: (db: DB) => Iterable<OrgRow>;
}
interface OrgInviteReducersExports {
	exports: Record<string, ReducerExport<never, never>>;
}
interface OrgInviteRowLike<InviteId, OrgId> {
	createdAt: Timestamp;
	email: string;
	expiresAt: number;
	id: InviteId;
	isAdmin: boolean;
	orgId: OrgId;
	token: string;
}
interface OrgInviteTableLike<Row> extends Iterable<Row> {
	insert: (row: Row) => Row;
}
interface OrgJoinRequestByOrgStatusIndexLike<Row, OrgId> extends Iterable<Row> {
	filterByOrgStatus: (orgId: OrgId, status: string) => Iterable<Row>;
}
interface OrgJoinRequestPkLike<Row> {
	update: (row: Row) => Row;
}
interface OrgJoinRequestRowLike<RequestId, OrgId> {
	id: RequestId;
	message: string | undefined;
	orgId: OrgId;
	status: string;
	userId: Identity;
}
type OrgJoinRequestTableLike<Row> = Iterable<Row>;
interface OrgMemberRowLike<MemberId, OrgId> {
	createdAt: Timestamp;
	id: MemberId;
	isAdmin: boolean;
	orgId: OrgId;
	updatedAt: Timestamp;
	userId: Identity;
}
interface OrgMemberTableLike<Row> extends Iterable<Row> {
	insert: (row: Row) => Row;
}
interface OrgPkLike<Row, Id> {
	find: (id: Id) => null | Row;
}
type OrgRole = "admin" | "member" | "owner";
interface OrgRowLike<OrgId> {
	id: OrgId;
	userId: Identity;
}
const DAY_HOURS = 24,
	DAYS_PER_WEEK = 7,
	MILLIS_PER_SECOND = 1000,
	MINUTES_PER_HOUR = 60,
	SECONDS_PER_MINUTE = 60,
	SEVEN_DAYS_MS =
		DAYS_PER_WEEK *
		DAY_HOURS *
		MINUTES_PER_HOUR *
		SECONDS_PER_MINUTE *
		MILLIS_PER_SECOND,
	TOKEN_BASE = 36,
	TOKEN_BYTES = 24,
	TOKEN_LENGTH = 32,
	tokenCounter = { value: 0 },
	makeInviteToken = (): string => {
		tokenCounter.value += 1;
		const base =
			Date.now().toString(TOKEN_BASE) + tokenCounter.value.toString(TOKEN_BASE);
		let token = base;
		while (token.length < TOKEN_LENGTH)
			token += (
				(tokenCounter.value * 7 + token.length * 13) %
				2176782336
			).toString(TOKEN_BASE);
		return token.slice(0, TOKEN_LENGTH);
	},
	findOrgMember = <
		OrgId,
		MemberId,
		MemberRow extends OrgMemberRowLike<MemberId, OrgId>,
	>(
		orgMemberTable: Iterable<MemberRow>,
		orgId: OrgId,
		userId: Identity,
	): MemberRow | null => {
		for (const member of orgMemberTable)
			if (
				Object.is(member.orgId, orgId) &&
				identityEquals(member.userId, userId)
			)
				return member;
		return null;
	},
	getRole = <OrgId, MemberId>(
		org: OrgRowLike<OrgId>,
		member: null | OrgMemberRowLike<MemberId, OrgId>,
		sender: Identity,
	): null | OrgRole => {
		if (identityEquals(org.userId, sender)) return "owner";
		if (!member) return null;
		if (member.isAdmin) return "admin";
		return "member";
	},
	requireAdminRole = <OrgId, MemberId>({
		operation,
		org,
		orgMemberTable,
		sender,
	}: {
		operation: string;
		org: OrgRowLike<OrgId>;
		orgMemberTable: Iterable<OrgMemberRowLike<MemberId, OrgId>>;
		sender: Identity;
	}) => {
		const member = findOrgMember(orgMemberTable, org.id, sender),
			role = getRole(org, member, sender);
		if (!role) throw makeError("NOT_ORG_MEMBER", `org:${operation}`);
		if (role === "member") throw makeError("FORBIDDEN", `org:${operation}`);
	},
	findInviteByToken = <
		InviteId,
		OrgId,
		InviteRow extends OrgInviteRowLike<InviteId, OrgId>,
	>(
		inviteByTokenIndex: Iterable<InviteRow>,
		token: string,
	): InviteRow | null => {
		for (const invite of inviteByTokenIndex)
			if (invite.token === token) return invite;
		return null;
	},
	findPendingJoinRequest = <
		RequestId,
		OrgId,
		JoinRequestRow extends OrgJoinRequestRowLike<RequestId, OrgId>,
	>(
		byOrgStatusIndex: OrgJoinRequestByOrgStatusIndexLike<JoinRequestRow, OrgId>,
		orgId: OrgId,
		userId: Identity,
	): JoinRequestRow | null => {
		const pendingRows = byOrgStatusIndex.filterByOrgStatus(orgId, "pending");
		for (const request of pendingRows)
			if (identityEquals(request.userId, userId)) return request;
		return null;
	},
	resolveAcceptedInvite = <
		OrgId,
		MemberId,
		InviteId,
		OrgRow extends OrgRowLike<OrgId>,
		MemberRow extends OrgMemberRowLike<MemberId, OrgId>,
		InviteRow extends OrgInviteRowLike<InviteId, OrgId>,
	>({
		inviteByTokenIndex,
		orgMemberTable,
		orgPk,
		sender,
		token,
	}: {
		inviteByTokenIndex: OrgInviteByTokenIndexLike<InviteRow>;
		orgMemberTable: OrgMemberTableLike<MemberRow>;
		orgPk: OrgPkLike<OrgRow, OrgId>;
		sender: Identity;
		token: string;
	}): { invite: InviteRow; org: OrgRow } => {
		const invite = findInviteByToken(inviteByTokenIndex, token);
		if (!invite) throw makeError("INVALID_INVITE", "org:accept_invite");
		if (invite.expiresAt < Date.now())
			throw makeError("INVITE_EXPIRED", "org:accept_invite");
		const org = orgPk.find(invite.orgId);
		if (!org) throw makeError("NOT_FOUND", "org:accept_invite");
		if (identityEquals(org.userId, sender))
			throw makeError("ALREADY_ORG_MEMBER", "org:accept_invite");
		const existingMember = findOrgMember(orgMemberTable, invite.orgId, sender);
		if (existingMember)
			throw makeError("ALREADY_ORG_MEMBER", "org:accept_invite");
		return { invite, org };
	},
	completeInviteAcceptance = <
		OrgId,
		MemberId,
		InviteId,
		RequestId,
		MemberRow extends OrgMemberRowLike<MemberId, OrgId>,
		InviteRow extends OrgInviteRowLike<InviteId, OrgId>,
		JoinRequestRow extends OrgJoinRequestRowLike<RequestId, OrgId>,
	>({
		invite,
		orgInvitePk,
		orgMemberTable,
		requestByOrgStatus,
		requestPk,
		sender,
		timestamp,
	}: {
		invite: InviteRow;
		orgInvitePk: OrgInvitePkLike<InviteRow, InviteId>;
		orgMemberTable: OrgMemberTableLike<MemberRow>;
		requestByOrgStatus: OrgJoinRequestByOrgStatusIndexLike<
			JoinRequestRow,
			OrgId
		>;
		requestPk: OrgJoinRequestPkLike<JoinRequestRow>;
		sender: Identity;
		timestamp: Timestamp;
	}) => {
		const pendingRequest = findPendingJoinRequest(
			requestByOrgStatus,
			invite.orgId,
			sender,
		);
		if (pendingRequest)
			requestPk.update({
				...(pendingRequest as unknown as Record<string, unknown>),
				status: "approved",
			} as JoinRequestRow);
		orgMemberTable.insert({
			createdAt: timestamp,
			id: 0 as MemberId,
			isAdmin: invite.isAdmin,
			orgId: invite.orgId,
			updatedAt: timestamp,
			userId: sender,
		} as MemberRow);
		const removed = orgInvitePk.delete(invite.id);
		if (!removed) throw makeError("NOT_FOUND", "org:accept_invite");
	},
	acceptInvite = <
		OrgId,
		MemberId,
		InviteId,
		RequestId,
		OrgRow extends OrgRowLike<OrgId>,
		MemberRow extends OrgMemberRowLike<MemberId, OrgId>,
		InviteRow extends OrgInviteRowLike<InviteId, OrgId>,
		JoinRequestRow extends OrgJoinRequestRowLike<RequestId, OrgId>,
	>({
		ctx,
		inviteByTokenIndex,
		orgInvitePk,
		orgMemberTable,
		orgPk,
		requestByOrgStatus,
		requestPk,
		token,
	}: {
		ctx: { sender: Identity; timestamp: Timestamp };
		inviteByTokenIndex: OrgInviteByTokenIndexLike<InviteRow>;
		orgInvitePk: OrgInvitePkLike<InviteRow, InviteId>;
		orgMemberTable: OrgMemberTableLike<MemberRow>;
		orgPk: OrgPkLike<OrgRow, OrgId>;
		requestByOrgStatus: OrgJoinRequestByOrgStatusIndexLike<
			JoinRequestRow,
			OrgId
		>;
		requestPk: OrgJoinRequestPkLike<JoinRequestRow>;
		token: string;
	}) => {
		const { invite } = resolveAcceptedInvite({
			inviteByTokenIndex,
			orgMemberTable,
			orgPk,
			sender: ctx.sender,
			token,
		});
		completeInviteAcceptance({
			invite,
			orgInvitePk,
			orgMemberTable,
			requestByOrgStatus,
			requestPk,
			sender: ctx.sender,
			timestamp: ctx.timestamp,
		});
	},
	makeInviteReducers = <
		DB,
		OrgId,
		MemberId,
		InviteId,
		RequestId,
		OrgRow extends OrgRowLike<OrgId>,
		MemberRow extends OrgMemberRowLike<MemberId, OrgId>,
		InviteRow extends OrgInviteRowLike<InviteId, OrgId>,
		JoinRequestRow extends OrgJoinRequestRowLike<RequestId, OrgId>,
	>(
		spacetimedb: {
			reducer: (
				opts: { name: string },
				params: Record<string, TypeBuilder<unknown, AlgebraicTypeType>>,
				fn: (
					ctx: { db: DB; sender: Identity; timestamp: Timestamp },
					args: Record<string, unknown>,
				) => void,
			) => ReducerExport<never, never>;
		},
		config: OrgInviteReducersConfig<
			DB,
			OrgId,
			MemberId,
			InviteId,
			RequestId,
			OrgRow,
			MemberRow,
			InviteRow,
			JoinRequestRow
		>,
	): OrgInviteReducersExports => {
		const inviteReducer = spacetimedb.reducer(
				{ name: "org_send_invite" },
				{
					email: config.builders.email,
					isAdmin: config.builders.isAdmin,
					orgId: config.builders.orgId,
				},
				(ctx, _args: Record<string, unknown>) => {
					const args = _args as {
							email: string;
							isAdmin: boolean;
							orgId: OrgId;
						},
						orgTable = config.orgTable(ctx.db),
						orgPk = config.orgPk(orgTable),
						orgMemberTable = config.orgMemberTable(ctx.db),
						orgInviteTable = config.orgInviteTable(ctx.db),
						org = orgPk.find(args.orgId);
					if (!org) throw makeError("NOT_FOUND", "org:invite");
					requireAdminRole({
						operation: "invite",
						org,
						orgMemberTable,
						sender: ctx.sender,
					});
					orgInviteTable.insert({
						createdAt: ctx.timestamp,
						email: args.email,
						expiresAt: Date.now() + SEVEN_DAYS_MS,
						id: 0 as InviteId,
						isAdmin: args.isAdmin,
						orgId: args.orgId,
						token: makeInviteToken(),
					} as InviteRow);
				},
			),
			acceptInviteReducer = spacetimedb.reducer(
				{ name: "org_accept_invite" },
				{ token: config.builders.token },
				(ctx, _args: Record<string, unknown>) => {
					const args = _args as { token: string },
						orgTable = config.orgTable(ctx.db),
						orgInviteTable = config.orgInviteTable(ctx.db),
						orgJoinRequestTable = config.orgJoinRequestTable(ctx.db);
					acceptInvite({
						ctx,
						inviteByTokenIndex: config.orgInviteByTokenIndex(orgInviteTable),
						orgInvitePk: config.orgInvitePk(orgInviteTable),
						orgMemberTable: config.orgMemberTable(ctx.db),
						orgPk: config.orgPk(orgTable),
						requestByOrgStatus:
							config.orgJoinRequestByOrgStatusIndex(orgJoinRequestTable),
						requestPk: config.orgJoinRequestPk(orgJoinRequestTable),
						token: args.token,
					});
				},
			),
			revokeInviteReducer = spacetimedb.reducer(
				{ name: "org_revoke_invite" },
				{ inviteId: config.builders.inviteId },
				(ctx, _args: Record<string, unknown>) => {
					const args = _args as { inviteId: InviteId },
						orgTable = config.orgTable(ctx.db),
						orgPk = config.orgPk(orgTable),
						orgMemberTable = config.orgMemberTable(ctx.db),
						orgInviteTable = config.orgInviteTable(ctx.db),
						orgInvitePk = config.orgInvitePk(orgInviteTable),
						invite = orgInvitePk.find(args.inviteId);
					if (!invite) throw makeError("NOT_FOUND", "org:revoke_invite");
					const org = orgPk.find(invite.orgId);
					if (!org) throw makeError("NOT_FOUND", "org:revoke_invite");
					requireAdminRole({
						operation: "revoke_invite",
						org,
						orgMemberTable,
						sender: ctx.sender,
					});
					const removed = orgInvitePk.delete(args.inviteId);
					if (!removed) throw makeError("NOT_FOUND", "org:revoke_invite");
				},
			);
		return {
			exports: {
				org_accept_invite: acceptInviteReducer,
				org_revoke_invite: revokeInviteReducer,
				org_send_invite: inviteReducer,
			},
		};
	};

export type {
	OrgInviteByTokenIndexLike,
	OrgInvitePkLike,
	OrgInviteReducersConfig,
	OrgInviteReducersExports,
	OrgInviteRowLike,
	OrgInviteTableLike,
	OrgJoinRequestByOrgStatusIndexLike,
	OrgJoinRequestPkLike,
	OrgJoinRequestRowLike,
	OrgJoinRequestTableLike,
	OrgMemberRowLike,
	OrgMemberTableLike,
	OrgPkLike,
	OrgRowLike,
};
export { makeInviteReducers, makeInviteToken };
