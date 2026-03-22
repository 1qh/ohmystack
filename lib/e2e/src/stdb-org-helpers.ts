/** biome-ignore-all lint/suspicious/useAwait: promise-function-async conflict */
/** biome-ignore-all lint/style/noProcessEnv: test helper */
/* eslint-disable no-await-in-loop */
interface HttpCtx {
  baseHttpUrl: string
  moduleName: string
  token: string
}
let httpCtx: HttpCtx | null = null
const DEFAULT_HTTP_URL = process.env.SPACETIMEDB_URI?.replace('ws://', 'http://').replace('wss://', 'https://') ?? 'http://localhost:3000',
  DEFAULT_MODULE = process.env.SPACETIMEDB_MODULE_NAME ?? 'noboil',
  setToken = (token: string) => {
    httpCtx = { baseHttpUrl: DEFAULT_HTTP_URL, moduleName: DEFAULT_MODULE, token }
  },
  getHttpCtx = (): HttpCtx => {
    if (!httpCtx) throw new Error('SpacetimeDB token not set. Call setToken(await getBrowserToken(page)) in beforeAll.')
    return httpCtx
  },
  httpReducer = async (name: string, args: unknown[], token: string): Promise<void> => {
    const ctx = getHttpCtx(),
      response = await fetch(`${ctx.baseHttpUrl}/v1/database/${ctx.moduleName}/call/${name}`, {
        body: JSON.stringify(args),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        method: 'POST'
      }),
      text = await response.text()
    if (!response.ok) throw new Error(`REDUCER_CALL_FAILED(${name}): ${text}`)
  },
  httpQuery = async (tableName: string, token: string): Promise<unknown[]> => {
    const ctx = getHttpCtx(),
      response = await fetch(`${ctx.baseHttpUrl}/v1/database/${ctx.moduleName}/sql`, {
        body: `SELECT * FROM ${tableName}`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
        method: 'POST'
      })
    if (!response.ok) return []
    const results = (await response.json()) as { rows?: unknown[]; schema?: unknown }[]
    if (!Array.isArray(results) || results.length === 0) return []
    const first = results[0],
      rows = first?.rows ?? [],
      fields = getSqlFields(first?.schema),
      mapped: unknown[] = []
    for (const row of rows) mapped.push(rowToObject(row, fields))
    return mapped
  },
  getSqlFields = (schema: unknown): string[] => {
    if (!schema || typeof schema !== 'object') return []
    const s = schema as Record<string, unknown>,
      elements = s.elements ?? (s.Product && typeof s.Product === 'object' ? (s.Product as Record<string, unknown>).elements : undefined),
      fields: string[] = []
    if (!Array.isArray(elements)) return []
    for (const item of elements)
      if (item && typeof item === 'object') {
        const nameValue = (item as Record<string, unknown>).name
        if (nameValue && typeof nameValue === 'object') {
          const { some } = nameValue as { some?: string }
          if (typeof some === 'string') fields.push(some)
        }
      }
    return fields
  },
  rowToObject = (row: unknown, fields: string[]): unknown => {
    if (!Array.isArray(row) || fields.length === 0 || fields.length !== row.length) return row
    const result: Record<string, unknown> = {}
    for (let i = 0; i < fields.length; i += 1) if (fields[i]) result[fields[i] as string] = row[i]
    return result
  },
  camelToSnake = (s: string): string => s.replaceAll(/([A-Z])/gu, '_$1').toLowerCase(),
  extractErrorCode = (e: unknown): null | { code: string } => {
    if (e instanceof Error) {
      const match = /(?:REDUCER_CALL_FAILED|code[":]+\s*)(?<code>[A-Z_]+)/u.exec(e.message)
      if (match?.groups?.code) return { code: match.groups.code }
    }
    return null
  },
  expectError = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (error) {
      const r = extractErrorCode(error)
      if (r) return r as T
      throw error
    }
  },
  ensureTestUser = async (): Promise<void> => {
    if (httpCtx) return
    const response = await fetch(`${DEFAULT_HTTP_URL}/v1/identity`, { method: 'POST' }),
      data = (await response.json()) as { identity: string; token: string }
    setToken(data.token)
    try {
      const { writeFileSync } = await import('node:fs'),
        { join } = await import('node:path')
      writeFileSync(join(process.cwd(), 'e2e', '.stdb-test-token.json'), JSON.stringify(data))
    } catch {
      /* ignore */
    }
  },
  createTestUser = async (_email: string, _name: string): Promise<string> => {
    const response = await fetch(`${DEFAULT_HTTP_URL}/v1/identity`, { method: 'POST' }),
      data = (await response.json()) as { identity: string; token: string }
    return data.identity
  },
  createTestOrg = async (slug: string, name: string): Promise<{ orgId: string }> => {
    const ctx = getHttpCtx()
    await httpReducer('org_create', [{ none: [] }, name, slug], ctx.token)
    await new Promise(r => setTimeout(r, 500))
    const orgs = (await httpQuery('org', ctx.token)) as { id: number; slug: string }[],
      org = orgs.find(o => o.slug === slug)
    if (!org) throw new Error(`Org with slug "${slug}" not found after creation`)
    const orgId = String(org.id)
    try {
      const { readFileSync, writeFileSync } = await import('node:fs'),
        { join } = await import('node:path'),
        tokenFile = join(process.cwd(), 'e2e', '.stdb-test-token.json'),
        existing = JSON.parse(readFileSync(tokenFile, 'utf8')) as Record<string, unknown>
      writeFileSync(tokenFile, JSON.stringify({ ...existing, orgId }))
    } catch {
      /* ignore */
    }
    return { orgId }
  },
  addTestOrgMember = async (_orgId: string, _userId: string, _isAdmin: boolean): Promise<string> => {
    return ''
  },
  removeTestOrgMember = async (_orgId: string, _userId: string): Promise<void> => {
    /* Not implemented for stdb */
  },
  makeOrgTestUtils = (prefix: string) => ({
    cleanupOrgTestData: async () => {
      try {
        const { token } = getHttpCtx(),
          orgs = (await httpQuery('org', token)) as { id: number; slug: string }[]
        for (const org of orgs)
          if (org.slug.startsWith(prefix))
            try {
              await httpReducer('org_remove', [org.id], token)
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
    generateSlug: (suffix: string) => `${prefix}-${suffix}-${Date.now()}`
  }),
  setupOrg = (testPrefix: string, orgName: string, orgSlugSuffix: string) => {
    const utils = makeOrgTestUtils(testPrefix)
    let orgId = '',
      orgSlug = ''
    return {
      ...utils,
      afterAll: async () => {
        await utils.cleanupOrgTestData()
      },
      beforeAll: async () => {
        await ensureTestUser()
        orgSlug = utils.generateSlug(orgSlugSuffix)
        const result = await createTestOrg(orgSlug, orgName)
        orgId = result.orgId
        return { orgId, orgSlug }
      },
      get orgId() {
        return orgId
      },
      get orgSlug() {
        return orgSlug
      }
    }
  },
  makeTc = () => {
    const reducerMap: Record<string, string> = {
        'org.acceptInvite': 'org_accept_invite',
        'org.create': 'org_create',
        'org.get': 'org',
        'org.getBySlug': 'org',
        'org.invite': 'org_send_invite',
        'org.leave': 'org_leave',
        'org.members': 'org_member',
        'org.membership': 'org_member',
        'org.myOrgs': 'org',
        'org.pendingInvites': 'org_invite',
        'org.remove': 'org_remove',
        'org.removeMember': 'org_remove_member',
        'org.revokeInvite': 'org_revoke_invite',
        'org.update': 'org_update',
        'project.create': 'project_create',
        'project.list': 'project',
        'project.read': 'project',
        'project.rm': 'project_remove',
        'project.update': 'project_update',
        'task.create': 'task_create',
        'task.read': 'task',
        'task.rm': 'task_remove',
        'task.toggle': 'task_toggle',
        'org.setAdmin': 'org_set_admin',
        'testauth.cleanupOrgTestData': 'noop',
        'testauth.cleanupTestData': 'noop',
        'testauth.cleanupTestUsers': 'noop',
        'testauth.ensureTestUser': 'noop',
        'testauth.requestJoinAsUser': 'noop',
        'wiki.create': 'wiki_create',
        'wiki.list': 'wiki',
        'wiki.read': 'wiki',
        'wiki.rm': 'wiki_remove',
        'wiki.softDelete': 'wiki_soft_delete',
        'wiki.update': 'wiki_update'
      },
      tableForQuery: Record<string, string> = {
        'org.get': 'org',
        'org.getBySlug': 'org',
        'org.members': 'org_member',
        'org.membership': 'org_member',
        'org.myOrgs': 'org',
        'org.pendingInvites': 'org_invite',
        'orgProfile.get': 'org_profile',
        'orgProfile.get': 'org_profile',
        'project.list': 'project',
        'project.read': 'project',
        'task.read': 'task',
        'wiki.list': 'wiki',
        'wiki.read': 'wiki'
      },
      resolveApiPath = (apiRef: unknown): string => {
        if (typeof apiRef === 'string') return apiRef
        const str = String(apiRef),
          match = /api\.(\w+)\.(\w+)/u.exec(str)
        if (match) return `${match[1]}.${match[2]}`
        return str
      },
      filterResults = (rows: unknown[], args: Record<string, unknown>, apiPath: string): unknown => {
        const arr = rows as Record<string, unknown>[]
        if (apiPath.endsWith('.get') || apiPath.endsWith('.read')) {
          const id = args.id ?? args.orgId
          if (id !== undefined) {
            const found = arr.find(r => String(r.id) === String(id))
            return found ?? null
          }
          return arr[0] ?? null
        }
        if (apiPath === 'org.getBySlug') {
          const { slug } = args
          return arr.find(r => r.slug === slug) ?? null
        }
        if (apiPath === 'org.myOrgs')
          return arr.map(o => ({ org: { ...o, _id: String((o as { id: number }).id) }, role: 'owner' }))
        if (apiPath === 'org.members' || apiPath === 'org.membership') {
          const { orgId } = args
          return arr.filter(r => String(r.org_id) === String(orgId))
        }
        if (apiPath === 'org.pendingInvites') {
          const { orgId } = args
          return arr.filter(r => String(r.org_id) === String(orgId))
        }
        if (apiPath.endsWith('.list')) {
          const { orgId } = args,
            filtered = orgId ? arr.filter(r => String(r.org_id) === String(orgId)) : arr
          return { isDone: true, page: filtered }
        }
        return arr
      }
    const optionFields = new Set(['avatarId', 'description', 'status', 'content', 'completed', 'priority', 'message']),
      toOption = (v: unknown) => (v === undefined || v === null ? { none: [] } : { some: v }),
      buildArgs = (apiPath: string, args: Record<string, unknown>): unknown[] => {
        const data = (args.data as Record<string, unknown>) ?? args,
          paramOrders: Record<string, string[]> = {
            org_accept_invite: ['token'],
            org_create: ['avatarId', 'name', 'slug'],
            org_leave: ['orgId'],
            org_remove_member: ['memberId'],
            org_remove: ['orgId'],
            org_revoke_invite: ['inviteId'],
            org_send_invite: ['email', 'isAdmin', 'orgId'],
            org_update: ['orgId', 'avatarId', 'name', 'slug'],
            project_create: ['orgId', 'description', 'name', 'status'],
            project_remove: ['id'],
            project_update: ['id', 'description', 'name', 'status', 'expectedUpdatedAt'],
            reset_all_data: [],
            task_create: ['orgId', 'completed', 'priority', 'title'],
            task_read: ['id'],
            task_remove: ['id'],
            task_toggle: ['id'],
            wiki_create: ['orgId', 'content', 'slug', 'status', 'title'],
            wiki_remove: ['id'],
            wiki_soft_delete: ['id'],
            wiki_update: ['id', 'content', 'slug', 'status', 'title', 'expectedUpdatedAt']
          },
          reducerName = reducerMap[apiPath]
        if (!reducerName) return []
        const order = paramOrders[reducerName]
        if (!order) return Object.values(data)
        return order.map(k => {
          const v = data[k] ?? data[camelToSnake(k)]
          return optionFields.has(k) ? toOption(v) : v
        })
      }
    return {
      mutation: async <T>(apiRef: unknown, args: Record<string, unknown>): Promise<T> => {
        const { token } = getHttpCtx(),
          apiPath = resolveApiPath(apiRef),
          reducerName = reducerMap[apiPath]
        if (!reducerName) throw new Error(`No reducer mapping for ${apiPath}`)
        if (reducerName === 'noop') return undefined as T
        const reducerArgs = buildArgs(apiPath, args)
        await httpReducer(reducerName, reducerArgs, token)
        await new Promise(r => setTimeout(r, 200))
        if (apiPath === 'org.create') {
          const data = (args.data as Record<string, unknown>) ?? args,
            orgs = (await httpQuery('org', token)) as { id: number; slug: string }[],
            org = orgs.find(o => o.slug === data.slug)
          return { orgId: org ? String(org.id) : '' } as T
        }
        if (apiPath.endsWith('.create')) {
          const tableName = tableForQuery[apiPath] ?? apiPath.split('.')[0],
            rows = (await httpQuery(tableName, token)) as { id: number }[]
          return rows.length > 0 ? String(rows.at(-1)?.id) : ('' as T)
        }
        return undefined as T
      },
      query: async <T>(apiRef: unknown, args: Record<string, unknown>): Promise<T> => {
        const { token } = getHttpCtx(),
          apiPath = resolveApiPath(apiRef),
          tableName = tableForQuery[apiPath]
        if (!tableName) throw new Error(`No table mapping for query ${apiPath}`)
        const rows = await httpQuery(tableName, token)
        return filterResults(rows, args, apiPath) as T
      },
      raw: {
        mutation: async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
          const { token } = getHttpCtx(),
            reducerName = name.includes(':') ? name.split(':')[1] : name
          await httpReducer(camelToSnake(reducerName ?? name), Object.values(args), token)
          return undefined as T
        },
        query: async <T>(name: string, _args: Record<string, unknown>): Promise<T> => {
          const { token } = getHttpCtx(),
            tableName = name.includes(':') ? name.split(':')[1] : name,
            rows = await httpQuery(camelToSnake(tableName ?? name), token)
          return rows as T
        }
      }
    }
  },
  tc = makeTc(),
  api = new Proxy(
    {},
    {
      get: (_target, mod: string) =>
        new Proxy(
          {},
          {
            get: (_t, fn: string) => `api.${mod}.${fn}`
          }
        )
    }
  ) as Record<string, Record<string, unknown>>,
  cleanupAll = async () => {
    if (ctx) {
      await cleanup(ctx)
      ctx = null
    }
  }
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
  tc
}
