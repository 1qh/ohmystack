/** biome-ignore-all lint/suspicious/useAwait: promise-function-async conflict */
/** biome-ignore-all lint/style/noProcessEnv: test helper */
/* eslint-disable no-await-in-loop */
import type { TestContext, TestUser } from '@noboil/spacetimedb/test'
import {
  callReducer,
  cleanup,
  createTestUser as createStdbUser,
  createTestContext,
  queryTable
} from '@noboil/spacetimedb/test'
let ctx: null | TestContext = null
const getCtx = async (): Promise<TestContext> => {
    if (!ctx) ctx = await createTestContext({ userCount: 1 })
    return ctx
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
    await getCtx()
  },
  createTestUser = async (_email: string, _name: string): Promise<string> => {
    const c = await getCtx(),
      user = await createStdbUser(c)
    return user.identity
  },
  createTestOrg = async (slug: string, name: string): Promise<{ orgId: string }> => {
    const c = await getCtx()
    await callReducer(c, 'org_create', { name, slug })
    const orgs = (await queryTable(c, 'org')) as { id: number; slug: string }[],
      org = orgs.find(o => o.slug === slug)
    if (!org) throw new Error(`Org with slug "${slug}" not found after creation`)
    return { orgId: String(org.id) }
  },
  addTestOrgMember = async (orgId: string, userId: string, isAdmin: boolean): Promise<string> => {
    const c = await getCtx(),
      userForMember = c.users.find(u => u.identity === userId)
    if (!userForMember) throw new Error(`User ${userId} not found in test context`)
    await callReducer(c, 'org_add_member', { is_admin: isAdmin, org_id: Number(orgId), user_id: userId }, userForMember)
    const members = (await queryTable(c, 'org_member')) as { id: number; org_id: number }[],
      member = members.find(m => m.org_id === Number(orgId))
    return member ? String(member.id) : ''
  },
  removeTestOrgMember = async (orgId: string, userId: string): Promise<void> => {
    const c = await getCtx()
    await callReducer(c, 'org_remove_member', { org_id: Number(orgId), user_id: userId })
  },
  makeOrgTestUtils = (prefix: string) => ({
    cleanupOrgTestData: async () => {
      const c = await getCtx()
      try {
        const orgs = (await queryTable(c, 'org')) as { id: number; slug: string }[]
        for (const org of orgs)
          if (org.slug.startsWith(prefix))
            try {
              await callReducer(c, 'org_remove', { org_id: org.id })
            } catch {
              /* Ignore cleanup errors */
            }
      } catch {
        /* Table might not exist */
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
        'testauth.cleanupTestData': 'reset_all_data',
        'testauth.ensureTestUser': 'noop',
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
    return {
      mutation: async <T>(apiRef: unknown, args: Record<string, unknown>): Promise<T> => {
        const c = await getCtx(),
          apiPath = resolveApiPath(apiRef),
          reducerName = reducerMap[apiPath]
        if (!reducerName) throw new Error(`No reducer mapping for ${apiPath}`)
        if (reducerName === 'noop') return undefined as T
        const snakeArgs: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(args)) snakeArgs[camelToSnake(k)] = v
        await callReducer(c, reducerName, snakeArgs)
        if (apiPath === 'org.create') {
          const orgs = (await queryTable(c, 'org')) as { id: number; slug: string }[],
            org = orgs.find(o => o.slug === args.slug || o.slug === (args.data as Record<string, unknown>)?.slug)
          return { orgId: org ? String(org.id) : '' } as T
        }
        if (apiPath.endsWith('.create')) {
          const tableName = tableForQuery[apiPath] ?? apiPath.split('.')[0],
            rows = (await queryTable(c, tableName)) as { id: number }[]
          return rows.length > 0 ? String(rows.at(-1)?.id) : ('' as T)
        }
        return undefined as T
      },
      query: async <T>(apiRef: unknown, args: Record<string, unknown>): Promise<T> => {
        const c = await getCtx(),
          apiPath = resolveApiPath(apiRef),
          tableName = tableForQuery[apiPath]
        if (!tableName) throw new Error(`No table mapping for query ${apiPath}`)
        const rows = await queryTable(c, tableName)
        return filterResults(rows, args, apiPath) as T
      },
      raw: {
        mutation: async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
          const c = await getCtx(),
            snakeArgs: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(args)) snakeArgs[camelToSnake(k)] = v
          const reducerName = name.includes(':') ? name.split(':')[1] : name
          await callReducer(c, camelToSnake(reducerName ?? name), snakeArgs)
          return undefined as T
        },
        query: async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
          const c = await getCtx(),
            tableName = name.includes(':') ? name.split(':')[1] : name,
            rows = await queryTable(c, camelToSnake(tableName ?? name))
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
