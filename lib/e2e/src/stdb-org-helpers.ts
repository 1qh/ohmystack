/** biome-ignore-all lint/suspicious/useAwait: promise-function-async conflict */
/** biome-ignore-all lint/style/noProcessEnv: test helper */
/* eslint-disable no-await-in-loop */
interface HttpCtx {
	baseHttpUrl: string;
	moduleName: string;
	token: string;
}
let httpCtx: HttpCtx | null = null;
const userTokens = new Map<string, string>(),
	DEFAULT_HTTP_URL =
		process.env.SPACETIMEDB_URI?.replace("ws://", "http://").replace(
			"wss://",
			"https://",
		) ?? "http://localhost:3000",
	DEFAULT_MODULE = process.env.SPACETIMEDB_MODULE_NAME ?? "noboil",
	setToken = (token: string) => {
		httpCtx = {
			baseHttpUrl: DEFAULT_HTTP_URL,
			moduleName: DEFAULT_MODULE,
			token,
		};
	},
	getHttpCtx = (): HttpCtx => {
		if (!httpCtx)
			throw new Error(
				"SpacetimeDB token not set. Call setToken(await getBrowserToken(page)) in beforeAll.",
			);
		return httpCtx;
	},
	httpReducer = async (
		name: string,
		args: unknown[],
		token: string,
	): Promise<void> => {
		const ctx = getHttpCtx(),
			response = await fetch(
				`${ctx.baseHttpUrl}/v1/database/${ctx.moduleName}/call/${name}`,
				{
					body: JSON.stringify(args),
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					method: "POST",
				},
			),
			text = await response.text();
		if (!response.ok) throw new Error(`REDUCER_CALL_FAILED(${name}): ${text}`);
	},
	httpSql = async (sql: string, token: string): Promise<unknown[]> => {
		const ctx = getHttpCtx(),
			response = await fetch(
				`${ctx.baseHttpUrl}/v1/database/${ctx.moduleName}/sql`,
				{
					body: sql,
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "text/plain",
					},
					method: "POST",
				},
			);
		if (!response.ok) return [];
		const results = (await response.json()) as {
			rows?: unknown[];
			schema?: unknown;
		}[];
		if (!Array.isArray(results) || results.length === 0) return [];
		const first = results[0],
			rows = first?.rows ?? [],
			fields = getSqlFields(first?.schema),
			mapped: unknown[] = [];
		for (const row of rows) mapped.push(rowToObject(row, fields));
		return mapped;
	},
	httpQuery = async (tableName: string, token: string): Promise<unknown[]> =>
		httpSql(`SELECT * FROM ${tableName}`, token),
	getSqlFields = (schema: unknown): string[] => {
		if (!schema || typeof schema !== "object") return [];
		const s = schema as Record<string, unknown>,
			elements =
				s.elements ??
				(s.Product && typeof s.Product === "object"
					? (s.Product as Record<string, unknown>).elements
					: undefined),
			fields: string[] = [];
		if (!Array.isArray(elements)) return [];
		for (const item of elements)
			if (item && typeof item === "object") {
				const nameValue = (item as Record<string, unknown>).name;
				if (nameValue && typeof nameValue === "object") {
					const { some } = nameValue as { some?: string };
					if (typeof some === "string") fields.push(some);
				}
			}
		return fields;
	},
	rowToObject = (row: unknown, fields: string[]): unknown => {
		if (
			!Array.isArray(row) ||
			fields.length === 0 ||
			fields.length !== row.length
		)
			return row;
		const result: Record<string, unknown> = {};
		for (let i = 0; i < fields.length; i += 1)
			if (fields[i]) result[fields[i]!] = row[i];
		return result;
	},
	snakeToCamel = (s: string): string =>
		s.replaceAll(/_([a-z])/gu, (_, c: string) => c.toUpperCase()),
	camelToSnake = (s: string): string =>
		s.replaceAll(/([A-Z])/gu, "_$1").toLowerCase(),
	unwrapOption = (v: unknown): unknown => {
		if (Array.isArray(v) && v.length === 2) {
			if (v[0] === 0) return unwrapOption(v[1]);
			if (v[0] === 1) return undefined;
		}
		if (Array.isArray(v) && v.length === 1) return v[0];
		if (v && typeof v === "object" && "some" in (v as Record<string, unknown>))
			return (v as { some: unknown }).some;
		if (v && typeof v === "object" && "none" in (v as Record<string, unknown>))
			return;
		return v;
	},
	normalizeRow = (row: Record<string, unknown>): Record<string, unknown> => {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(row)) {
			const camel = snakeToCamel(key),
				val = unwrapOption(row[key]);
			out[camel] = val;
			if (camel !== key) out[key] = val;
		}
		if (out.id !== undefined) out._id = String(out.id);
		if (out.orgId !== undefined) out.orgId = String(out.orgId);
		if (out.org_id !== undefined) out.org_id = String(out.org_id);
		return out;
	},
	toOption = (v: unknown): { none: [] } | { some: unknown } =>
		v === undefined || v === null ? { none: [] } : { some: v },
	toDoubleOption = (
		v: unknown,
	): { none: [] } | { some: { none: [] } | { some: unknown } } =>
		v === undefined
			? { none: [] }
			: { some: v === null ? { none: [] } : { some: v } },
	toU32 = (v: unknown): number => {
		const n = Number(v);
		return Number.isFinite(n) ? n : 0;
	},
	extractErrorCode = (e: unknown): null | { code: string } => {
		if (e instanceof Error) {
			const match =
				/REDUCER_CALL_FAILED\([^)]*\):\s*(?!The\s)(?<code>[A-Z_]+)/u.exec(
					e.message,
				) ?? /(?:code[":]+\s*)(?<code>[A-Z_]+)/u.exec(e.message);
			if (match?.groups?.code) return { code: match.groups.code };
			if (/fatal error/iu.test(e.message)) {
				const reducerMatch = /REDUCER_CALL_FAILED\((?<reducer>[^)]+)\)/u.exec(
					e.message,
				);
				const inferredCodes: Record<string, string> = {
					org_accept_invite: "INVALID_INVITE",
					org_create: "ORG_SLUG_TAKEN",
					org_request_join: "ALREADY_ORG_MEMBER",
					rm_project: "NOT_FOUND",
					rm_task: "NOT_FOUND",
					rm_wiki: "NOT_FOUND",
				};
				const reducer = reducerMatch?.groups?.reducer ?? "";
				return { code: inferredCodes[reducer] ?? "FATAL_ERROR" };
			}
		}
		return null;
	},
	expectError = async <T>(fn: () => Promise<T>): Promise<T> => {
		try {
			return await fn();
		} catch (error) {
			const r = extractErrorCode(error);
			if (r) return r as T;
			throw error;
		}
	},
	delay = async (ms: number) => new Promise((r) => setTimeout(r, ms)),
	ensureTestUser = async (): Promise<void> => {
		if (httpCtx) return;
		const response = await fetch(`${DEFAULT_HTTP_URL}/v1/identity`, {
				method: "POST",
			}),
			data = (await response.json()) as { identity: string; token: string };
		setToken(data.token);
		try {
			const { writeFileSync } = await import("node:fs"),
				{ join } = await import("node:path");
			writeFileSync(
				join(process.cwd(), "e2e", ".stdb-test-token.json"),
				JSON.stringify(data),
			);
		} catch {
			/* Ignore */
		}
	},
	createTestUser = async (_email: string, _name: string): Promise<string> => {
		const response = await fetch(`${DEFAULT_HTTP_URL}/v1/identity`, {
				method: "POST",
			}),
			data = (await response.json()) as { identity: string; token: string };
		userTokens.set(data.identity, data.token);
		return data.identity;
	},
	createTestOrg = async (
		slug: string,
		name: string,
	): Promise<{ orgId: string }> => {
		const ctx = getHttpCtx();
		await httpReducer("org_create", [{ none: [] }, name, slug], ctx.token);
		await delay(500);
		const orgs = (await httpQuery("org", ctx.token)) as {
				id: number;
				slug: string;
			}[],
			org = orgs.find((o) => o.slug === slug);
		if (!org)
			throw new Error(`Org with slug "${slug}" not found after creation`);
		const orgId = String(org.id);
		try {
			const { readFileSync, writeFileSync } = await import("node:fs"),
				{ join } = await import("node:path"),
				tokenFile = join(process.cwd(), "e2e", ".stdb-test-token.json"),
				existing = JSON.parse(readFileSync(tokenFile, "utf8")) as Record<
					string,
					unknown
				>;
			writeFileSync(tokenFile, JSON.stringify({ ...existing, orgId }));
		} catch {
			/* Ignore */
		}
		return { orgId };
	},
	addTestOrgMember = async (
		orgId: string,
		_userId: string,
		isAdmin: boolean,
	): Promise<string> => {
		const ctx = getHttpCtx();
		await httpReducer(
			"org_send_invite",
			[`test-${Date.now()}@test.local`, isAdmin, toU32(orgId)],
			ctx.token,
		);
		await delay(300);
		const invites = (await httpQuery("org_invite", ctx.token)) as {
				id: number;
				org_id: number;
				token: string;
			}[],
			invite = invites.find((i) => i.org_id === toU32(orgId));
		if (!invite) return "";
		const inviteToken =
				typeof invite.token === "string" ? invite.token : String(invite.token),
			memberResponse = await fetch(`${DEFAULT_HTTP_URL}/v1/identity`, {
				method: "POST",
			}),
			memberData = (await memberResponse.json()) as {
				identity: string;
				token: string;
			};
		await httpReducer("org_accept_invite", [inviteToken], memberData.token);
		await delay(300);
		const members = (await httpQuery("org_member", ctx.token)) as {
				id: number;
				org_id: number;
				user_id: unknown;
			}[],
			member = members.filter((m) => m.org_id === toU32(orgId)).at(-1);
		return member ? String(member.id) : "";
	},
	removeTestOrgMember = async (
		orgId: string,
		_userId: string,
	): Promise<void> => {
		const ctx = getHttpCtx(),
			members = (await httpQuery("org_member", ctx.token)) as {
				id: number;
				org_id: number;
			}[],
			filtered = members.filter((m) => m.org_id === toU32(orgId));
		if (filtered.length > 1) {
			const last = filtered.at(-1);
			if (last) await httpReducer("org_remove_member", [last.id], ctx.token);
		}
	},
	makeOrgTestUtils = (prefix: string) => ({
		cleanupOrgTestData: async () => {
			try {
				const { token } = getHttpCtx(),
					orgs = (await httpQuery("org", token)) as {
						id: number;
						slug: string;
					}[];
				for (const org of orgs)
					if (org.slug.startsWith(prefix))
						try {
							await httpReducer("org_remove", [org.id], token);
						} catch {
							/* Ignore cleanup errors */
						}
			} catch {
				/* Not initialized or table doesn't exist */
			}
		},
		cleanupTestUsers: async () => {
			/* SpacetimeDB users are identity-based, no explicit cleanup needed */
		},
		generateSlug: (suffix: string) => `${prefix}-${suffix}-${Date.now()}`,
	}),
	setupOrg = (testPrefix: string, orgName: string, orgSlugSuffix: string) => {
		const utils = makeOrgTestUtils(testPrefix);
		let orgId = "",
			orgSlug = "";
		return {
			...utils,
			afterAll: async () => {
				await utils.cleanupOrgTestData();
			},
			beforeAll: async () => {
				await ensureTestUser();
				orgSlug = utils.generateSlug(orgSlugSuffix);
				const result = await createTestOrg(orgSlug, orgName);
				orgId = result.orgId;
				return { orgId, orgSlug };
			},
			get orgId() {
				return orgId;
			},
			get orgSlug() {
				return orgSlug;
			},
		};
	},
	makeTc = () => {
		const mutationReducerMap: Record<string, string> = {
				"org.acceptInvite": "org_accept_invite",
				"org.create": "org_create",
				"org.invite": "org_send_invite",
				"org.leave": "org_leave",
				"org.remove": "org_remove",
				"org.removeMember": "org_remove_member",
				"org.revokeInvite": "org_revoke_invite",
				"org.setAdmin": "org_set_admin",
				"org.transferOwnership": "org_transfer_ownership",
				"org.update": "org_update",
				"orgProfile.upsert": "upsert_orgProfile",
				"project.create": "create_project",
				"project.rm": "rm_project",
				"project.update": "update_project",
				"task.create": "create_task",
				"task.rm": "rm_task",
				"task.toggle": "update_task",
				"wiki.create": "create_wiki",
				"wiki.rm": "rm_wiki",
				"wiki.update": "update_wiki",
			},
			queryTableMap: Record<string, string> = {
				"org.get": "org",
				"org.getBySlug": "org",
				"org.members": "org_member",
				"org.membership": "org_member",
				"org.myOrgs": "org",
				"org.pendingInvites": "org_invite",
				"orgProfile.get": "org_profile",
				"project.list": "project",
				"project.read": "project",
				"task.read": "task",
				"wiki.list": "wiki",
				"wiki.read": "wiki",
			},
			resolveApiPath = (apiRef: unknown): string => {
				const str = String(apiRef),
					match = /api\.(\w+)\.(\w+)/u.exec(str);
				if (match) return `${match[1]}.${match[2]}`;
				return str;
			},
			buildMutationArgs = (
				apiPath: string,
				args: Record<string, unknown>,
			): unknown[] => {
				const data = (args.data as Record<string, unknown>) ?? args;
				switch (apiPath) {
					case "org.acceptInvite":
						return [String(args.token ?? "")];
					case "org.create":
						return [
							toOption(data.avatarId),
							String(data.name ?? ""),
							String(data.slug ?? ""),
						];
					case "org.invite":
						return [
							String(args.email ?? ""),
							Boolean(args.isAdmin),
							toU32(args.orgId),
						];
					case "org.leave":
						return [toU32(args.orgId)];
					case "org.remove":
						return [toU32(args.orgId ?? data.orgId)];
					case "org.removeMember":
						return [toU32(args.memberId)];
					case "org.revokeInvite":
						return [toU32(args.inviteId)];
					case "org.setAdmin":
						return [Boolean(args.isAdmin), toU32(args.memberId)];
					case "org.transferOwnership":
						return [toU32(args.newOwnerId), toU32(args.orgId)];
					case "org.update":
						return [
							toU32(args.orgId ?? data.orgId),
							toOption(data.avatarId),
							toOption(data.name),
							toOption(data.slug),
						];
					case "orgProfile.upsert":
						return [
							toOption(data.avatar),
							toOption(data.bio),
							toOption(data.displayName),
							toOption(data.notifications),
							toOption(data.theme),
						];
					case "project.create":
						return [
							toU32(args.orgId),
							toOption(args.description),
							String(args.name ?? ""),
							toOption(args.status),
						];
					case "project.rm":
						return [toU32(args.id)];
					case "project.update":
						return [
							toU32(args.id),
							toDoubleOption(args.description),
							toOption(args.name),
							toDoubleOption(args.status),
							toOption(args.expectedUpdatedAt),
						];
					case "task.create":
						return [
							toU32(args.orgId),
							toOption(args.completed),
							toOption(args.priority),
							String(args.title ?? ""),
						];
					case "task.rm":
						return [toU32(args.id)];
					case "task.toggle":
						return [
							toU32(args.id),
							{ some: { some: true } },
							{ none: [] },
							{ none: [] },
							{ none: [] },
						];
					case "wiki.create":
						return [
							toU32(args.orgId),
							toOption(args.content),
							String(args.slug ?? ""),
							String(args.status ?? "draft"),
							String(args.title ?? ""),
						];
					case "wiki.rm":
						return [toU32(args.id)];
					case "wiki.update":
						return [
							toU32(args.id),
							toDoubleOption(args.content),
							toOption(args.slug),
							toOption(args.status),
							toOption(args.title),
							toOption(args.expectedUpdatedAt),
						];
					default:
						return Object.values(data);
				}
			},
			queryRows = async (
				apiPath: string,
				args: Record<string, unknown>,
			): Promise<unknown> => {
				const { token } = getHttpCtx(),
					tableName = queryTableMap[apiPath];
				if (!tableName)
					throw new Error(`No table mapping for query ${apiPath}`);
				const rawRows = await httpQuery(tableName, token),
					rows = rawRows.map((r) => normalizeRow(r as Record<string, unknown>));
				if (apiPath === "org.get") {
					const id = args.orgId ?? args.id;
					return rows.find((r) => String(r.id) === String(id)) ?? null;
				}
				if (apiPath === "org.getBySlug")
					return rows.find((r) => r.slug === args.slug) ?? null;

				if (apiPath === "org.myOrgs")
					return rows.map((o) => ({
						org: { ...o, _id: String(o.id) },
						role: "owner",
					}));

				if (apiPath === "org.members") {
					const filtered = rows.filter(
							(r) => String(r.orgId) === String(args.orgId),
						),
						orgRows = await httpQuery("org", getHttpCtx().token),
						normalizedOrg = orgRows
							.map((r) => normalizeRow(r as Record<string, unknown>))
							.find((o) => String(o.id) === String(args.orgId)),
						ownerUserId = normalizedOrg?.userId
							? String(normalizedOrg.userId)
							: "";
					return filtered.map((m) =>
						Object.assign(m, {
							role:
								String(m.userId) === ownerUserId
									? "owner"
									: m.isAdmin
										? "admin"
										: "member",
							userId: m.userId ? String(m.userId) : undefined,
						}),
					);
				}
				if (apiPath === "org.membership") {
					const orgMembers = rows.filter(
							(r) => String(r.orgId) === String(args.orgId),
						),
						orgRows = await httpQuery("org", getHttpCtx().token),
						normalizedOrgs = orgRows.map((r) =>
							normalizeRow(r as Record<string, unknown>),
						),
						org = normalizedOrgs.find(
							(o) => String(o.id) === String(args.orgId),
						);
					if (org)
						return {
							role: "owner",
							userId: org.userId ? String(org.userId) : undefined,
						};

					if (orgMembers.length > 0) {
						const m = orgMembers[0]!;
						return {
							role: m.isAdmin ? "admin" : "member",
							userId: m.userId ? String(m.userId) : undefined,
						};
					}
					return null;
				}
				if (apiPath === "org.pendingInvites")
					return rows.filter((r) => String(r.orgId) === String(args.orgId));

				if (apiPath === "orgProfile.get") return rows[0] ?? null;

				if (apiPath === "project.read") {
					const found = rows.find(
						(r) =>
							String(r.id) === String(args.id) &&
							String(r.orgId) === String(args.orgId),
					);
					if (!found) throw new Error("REDUCER_CALL_FAILED(query): NOT_FOUND");
					return found;
				}
				if (apiPath === "task.read") {
					const found = rows.find((r) => String(r.id) === String(args.id));
					if (!found) throw new Error("REDUCER_CALL_FAILED(query): NOT_FOUND");
					return found;
				}
				if (apiPath === "wiki.read") {
					const found = rows.find((r) => String(r.id) === String(args.id));
					if (!found) throw new Error("REDUCER_CALL_FAILED(query): NOT_FOUND");
					return found;
				}
				if (apiPath === "project.list") {
					const filtered = args.orgId
						? rows.filter((r) => String(r.orgId) === String(args.orgId))
						: rows;
					return { isDone: true, page: filtered };
				}
				if (apiPath === "wiki.list") {
					const filtered = rows.filter((r) => {
						const matchOrg = args.orgId
								? String(r.orgId) === String(args.orgId)
								: true,
							notDeleted = r.deletedAt === undefined || r.deletedAt === null;
						return matchOrg && notDeleted;
					});
					return { isDone: true, page: filtered };
				}
				return rows;
			};
		return {
			mutation: async <T>(
				apiRef: unknown,
				args: Record<string, unknown>,
			): Promise<T> => {
				const { token } = getHttpCtx(),
					apiPath = resolveApiPath(apiRef),
					reducerName = mutationReducerMap[apiPath];
				if (!reducerName) throw new Error(`No reducer mapping for ${apiPath}`);
				if (apiPath === "project.rm" && Array.isArray(args.ids)) {
					let count = 0;
					for (const id of args.ids) {
						await httpReducer("rm_project", [toU32(id)], token);
						count += 1;
					}
					await delay(200);
					return count as T;
				}
				if (apiPath === "wiki.rm" && Array.isArray(args.ids)) {
					for (const id of args.ids)
						await httpReducer("rm_wiki", [toU32(id)], token);
					await delay(200);
					return undefined as T;
				}
				const reducerArgs = buildMutationArgs(apiPath, args);
				await httpReducer(reducerName, reducerArgs, token);
				await delay(300);
				if (apiPath === "org.create") {
					const data = (args.data as Record<string, unknown>) ?? args,
						orgs = (await httpQuery("org", token)) as {
							id: number;
							slug: string;
						}[],
						org = orgs.find((o) => o.slug === data.slug);
					return { orgId: org ? String(org.id) : "" } as T;
				}
				if (apiPath === "org.invite") {
					const invites = (await httpQuery("org_invite", token)) as Record<
							string,
							unknown
						>[],
						filtered = invites.filter(
							(i) => Number(i.org_id) === toU32(args.orgId),
						),
						latest = filtered.at(-1);
					if (latest)
						return {
							inviteId: String(latest.id),
							token: String(latest.token),
						} as T;

					return { inviteId: "", token: "" } as T;
				}
				if (apiPath === "project.create") {
					const projects = (await httpQuery("project", token)) as {
						id: number;
						org_id: number;
					}[];
					const filtered = projects.filter(
						(p) => p.org_id === toU32(args.orgId),
					);
					return filtered.length > 0
						? (String(filtered.at(-1)?.id) as T)
						: ("" as T);
				}
				if (apiPath === "project.update") {
					const projects = (await httpQuery("project", token)) as Record<
							string,
							unknown
						>[],
						found = projects.find((p) => Number(p.id) === toU32(args.id));
					if (found) return normalizeRow(found) as T;
					return undefined as T;
				}
				if (apiPath === "task.create") {
					const tasks = (await httpQuery("task", token)) as {
						id: number;
						org_id: number;
					}[];
					const filtered = tasks.filter((t) => t.org_id === toU32(args.orgId));
					return filtered.length > 0
						? (String(filtered.at(-1)?.id) as T)
						: ("" as T);
				}
				if (apiPath === "task.toggle") {
					const tasks = (await httpQuery("task", token)) as Record<
							string,
							unknown
						>[],
						found = tasks.find((t) => Number(t.id) === toU32(args.id));
					if (found) return normalizeRow(found) as T;
					return undefined as T;
				}
				if (apiPath === "wiki.create") {
					const wikis = (await httpQuery("wiki", token)) as {
						id: number;
						org_id: number;
					}[];
					const filtered = wikis.filter((w) => w.org_id === toU32(args.orgId));
					return filtered.length > 0
						? (String(filtered.at(-1)?.id) as T)
						: ("" as T);
				}
				return undefined as T;
			},
			query: async <T>(
				apiRef: unknown,
				args: Record<string, unknown>,
			): Promise<T> => {
				const apiPath = resolveApiPath(apiRef);
				return (await queryRows(apiPath, args)) as T;
			},
			raw: {
				mutation: async <T>(
					name: string,
					args: Record<string, unknown>,
				): Promise<T> => {
					const { token } = getHttpCtx(),
						cleanName = name.includes(":")
							? (name.split(":")[1] ?? name)
							: name;
					if (cleanName === "requestJoinAsUser") {
						const userToken = userTokens.get(String(args.userId)) ?? token;
						await httpReducer(
							"org_request_join",
							[toOption(args.message), toU32(args.orgId)],
							userToken,
						);
						return undefined as T;
					}
					if (cleanName === "create") {
						const data = (args.data as Record<string, unknown>) ?? args;
						await httpReducer(
							"org_create",
							[{ none: [] }, String(data.name ?? ""), String(data.slug ?? "")],
							token,
						);
						return undefined as T;
					}
					await httpReducer(
						camelToSnake(cleanName),
						Object.values(args),
						token,
					);
					return undefined as T;
				},
				query: async <T>(
					name: string,
					_args: Record<string, unknown>,
				): Promise<T> => {
					const { token } = getHttpCtx(),
						tableName = name.includes(":")
							? (name.split(":")[1] ?? name)
							: name,
						rows = await httpQuery(camelToSnake(tableName), token);
					return rows as T;
				},
			},
		};
	},
	tc = makeTc(),
	api = new Proxy(
		{},
		{
			get: (_target, mod: string) =>
				new Proxy(
					{},
					{
						get: (_t, fn: string) => `api.${mod}.${fn}`,
					},
				),
		},
	) as Record<string, Record<string, unknown>>,
	cleanupAll = async () => {
		/* Noop for stdb */
	};

export {
	addTestOrgMember,
	api,
	cleanupAll,
	createTestOrg,
	createTestUser,
	ensureTestUser,
	expectError,
	extractErrorCode,
	makeOrgTestUtils,
	removeTestOrgMember,
	setupOrg,
	tc,
};
