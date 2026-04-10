/* eslint-disable no-await-in-loop, complexity */
/* oxlint-disable max-statements */
/** biome-ignore-all lint/suspicious/useAwait: test helper */
/** biome-ignore-all lint/style/noProcessEnv: test helper */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential test operations */
/** biome-ignore-all lint/performance/useTopLevelRegex: test helper */
interface HttpCtx {
  baseHttpUrl: string
  moduleName: string
  token: string
}
interface IdentityResponse {
  identity: string
  token: string
}
interface InviteResult {
  inviteId: string
  token: string
}
interface ListResult {
  isDone: boolean
  page: NormalizedRow[]
}
interface MembershipResult {
  role: string
  userId?: string
}
interface NormalizedRow {
  [key: string]: unknown
  _id?: string
  deletedAt?: unknown
  id?: unknown
  isAdmin?: unknown
  org_id?: string
  orgId?: string
  slug?: unknown
  user_id?: unknown
  userId?: unknown
}
interface OrgCreateResult {
  orgId: string
}
interface SqlResult {
  rows?: unknown[][]
  schema?: SqlSchema
}
interface SqlSchema {
  elements?: SqlSchemaElement[]
  Product?: { elements?: SqlSchemaElement[] }
}
interface SqlSchemaElement {
  name?: { some?: string }
}
const SNAKE_TO_CAMEL_RE = /_(?<ch>[a-z])/gu
const CAMEL_TO_SNAKE_RE = /(?<ch>[A-Z])/gu
const ERROR_CODE_RE = /REDUCER_CALL_FAILED\([^)]*\):\s*(?!The\s)(?<code>[A-Z_]+)/u
const ERROR_CODE_FALLBACK_RE = /(?:code[":]+\s*)(?<code>[A-Z_]+)/u
const FATAL_ERROR_RE = /fatal error/iu
const REDUCER_NAME_RE = /REDUCER_CALL_FAILED\((?<reducer>[^)]+)\)/u
const API_PATH_RE = /api\.(?<mod>\w+)\.(?<fn>\w+)/u
let httpCtx: HttpCtx | null = null
const userTokens = new Map<string, string>()
const DEFAULT_HTTP_URL =
  process.env.SPACETIMEDB_URI?.replace('ws://', 'http://').replace('wss://', 'https://') ?? 'http://localhost:4000'
const DEFAULT_MODULE = process.env.SPACETIMEDB_MODULE_NAME ?? 'noboil'
const setToken = (token: string) => {
  httpCtx = {
    baseHttpUrl: DEFAULT_HTTP_URL,
    moduleName: DEFAULT_MODULE,
    token
  }
}
const getHttpCtx = (): HttpCtx => {
  if (!httpCtx) throw new Error('SpacetimeDB token not set. Call setToken(await getBrowserToken(page)) in beforeAll.')
  return httpCtx
}
const getSqlFields = (schema: SqlSchema | undefined): string[] => {
  if (!schema) return []
  const elements = schema.elements ?? (schema.Product ? schema.Product.elements : undefined)
  const fields: string[] = []
  if (!Array.isArray(elements)) return []
  for (const item of elements) {
    const nameValue = item.name
    if (nameValue) {
      const { some } = nameValue
      if (typeof some === 'string') fields.push(some)
    }
  }
  return fields
}
const rowToObject = (row: unknown, fields: string[]): Record<string, unknown> => {
  if (!Array.isArray(row) || fields.length === 0 || fields.length !== row.length) return {}
  const result: Record<string, unknown> = {}
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i]
    if (field) result[field] = row[i]
  }
  return result
}
const httpReducer = async (name: string, args: unknown[], token: string): Promise<void> => {
  const ctx = getHttpCtx()
  const response = await fetch(`${ctx.baseHttpUrl}/v1/database/${ctx.moduleName}/call/${name}`, {
    body: JSON.stringify(args),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`REDUCER_CALL_FAILED(${name}): ${text}`)
}
const httpSql = async (sql: string, token: string): Promise<Record<string, unknown>[]> => {
  const ctx = getHttpCtx()
  const response = await fetch(`${ctx.baseHttpUrl}/v1/database/${ctx.moduleName}/sql`, {
    body: sql,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain'
    },
    method: 'POST'
  })
  if (!response.ok) return []
  const results: unknown = await response.json()
  if (!Array.isArray(results) || results.length === 0) return []
  const first = results[0] as SqlResult
  const rows = first.rows ?? []
  const fields = getSqlFields(first.schema)
  const mapped: Record<string, unknown>[] = []
  for (const row of rows) mapped.push(rowToObject(row, fields))
  return mapped
}
const httpQuery = async (tableName: string, token: string): Promise<Record<string, unknown>[]> =>
  httpSql(`SELECT * FROM ${tableName}`, token)
const snakeToCamel = (s: string): string =>
  s.replaceAll(SNAKE_TO_CAMEL_RE, (...args: unknown[]) => {
    const groups = args.at(-1) as { ch: string }
    return groups.ch.toUpperCase()
  })
const camelToSnake = (s: string): string => s.replaceAll(CAMEL_TO_SNAKE_RE, '_$<ch>').toLowerCase()
const unwrapOption = (v: unknown): unknown => {
  if (Array.isArray(v) && v.length === 2) {
    if (v[0] === 0) return unwrapOption(v[1])
    if (v[0] === 1) return
  }
  if (Array.isArray(v) && v.length === 1) return v[0]
  if (v && typeof v === 'object' && 'some' in v) return (v as { some: unknown }).some
  if (v && typeof v === 'object' && 'none' in v) return
  return v
}
const stripHexPrefix = (v: unknown): unknown => {
  if (typeof v === 'string' && v.startsWith('0x')) return v.slice(2)
  return v
}
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? `${v}` : '')
const normalizeRow = (row: Record<string, unknown>): NormalizedRow => {
  const out: NormalizedRow = {}
  for (const key of Object.keys(row)) {
    const camel = snakeToCamel(key)
    let val = unwrapOption(row[key])
    if (camel === 'userId' || key === 'user_id') val = stripHexPrefix(val)
    out[camel] = val
    if (camel !== key) out[key] = val
  }
  if (out.id !== undefined) out._id = str(out.id)
  if (out.orgId !== undefined) out.orgId = str(out.orgId)
  if (out.org_id !== undefined) out.org_id = str(out.org_id)
  return out
}
const toOption = (v: unknown): { none: [] } | { some: unknown } =>
  v === undefined || v === null ? { none: [] } : { some: v }
const toDoubleOption = (v: unknown): { none: [] } | { some: { none: [] } | { some: unknown } } =>
  v === undefined ? { none: [] } : { some: v === null ? { none: [] } : { some: v } }
const toU32 = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const extractErrorCode = (e: unknown): null | { code: string } => {
  if (e instanceof Error) {
    const match = ERROR_CODE_RE.exec(e.message) ?? ERROR_CODE_FALLBACK_RE.exec(e.message)
    if (match?.groups?.code) return { code: match.groups.code }
    if (FATAL_ERROR_RE.test(e.message)) {
      const reducerMatch = REDUCER_NAME_RE.exec(e.message)
      const inferredCodes: Record<string, string> = {
        org_accept_invite: 'INVALID_INVITE',
        org_create: 'ORG_SLUG_TAKEN',
        org_request_join: 'ALREADY_ORG_MEMBER',
        rm_project: 'NOT_FOUND',
        rm_task: 'NOT_FOUND',
        rm_wiki: 'NOT_FOUND'
      }
      const reducer = reducerMatch?.groups?.reducer ?? ''
      return { code: inferredCodes[reducer] ?? 'FATAL_ERROR' }
    }
  }
  return null
}
const expectError = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    const r = extractErrorCode(error)
    if (r) return r as T
    throw error
  }
}
const delay = async (ms: number): Promise<void> => {
  await new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })
}
const ensureTestUser = async (): Promise<void> => {
  if (httpCtx) return
  const response = await fetch(`${DEFAULT_HTTP_URL}/v1/identity`, {
    method: 'POST'
  })
  const data = (await response.json()) as IdentityResponse
  setToken(data.token)
  try {
    const { writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    writeFileSync(join(process.cwd(), 'e2e', '.stdb-test-token.json'), JSON.stringify(data))
  } catch {
    /* */
  }
}
const createTestUser = async (email: string, name: string): Promise<string> => {
  const response = await fetch(`${DEFAULT_HTTP_URL}/v1/identity`, {
    method: 'POST'
  })
  const data = (await response.json()) as IdentityResponse
  const key = `${data.identity}:${email}:${name}`
  userTokens.set(data.identity, data.token)
  userTokens.set(key, data.token)
  return data.identity
}
const createTestOrg = async (slug: string, name: string): Promise<OrgCreateResult> => {
  const ctx = getHttpCtx()
  await httpReducer('org_create', [{ none: [] }, name, slug], ctx.token)
  await delay(500)
  const orgs = await httpQuery('org', ctx.token)
  const org = orgs.find(o => o.slug === slug)
  if (!org) throw new Error(`Org with slug "${slug}" not found after creation`)
  const orgId = String(org.id)
  try {
    const { readFileSync, writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const tokenFile = join(process.cwd(), 'e2e', '.stdb-test-token.json')
    const existing = JSON.parse(readFileSync(tokenFile, 'utf8')) as Record<string, unknown>
    writeFileSync(tokenFile, JSON.stringify({ ...existing, orgId }))
  } catch {
    /* */
  }
  return { orgId }
}
const addTestOrgMember = async (orgId: string, _userId: string, isAdmin: boolean): Promise<string> => {
  const ctx = getHttpCtx()
  await httpReducer('org_send_invite', [`test-${Date.now()}@test.local`, isAdmin, toU32(orgId)], ctx.token)
  await delay(500)
  const invites = await httpQuery('org_invite', ctx.token)
  const filtered = invites.filter(i => Number(i.org_id) === toU32(orgId))
  const invite = filtered.at(-1)
  if (!invite) return ''
  const inviteToken = typeof invite.token === 'string' ? invite.token : String(invite.token)
  const memberToken = userTokens.get(_userId)
  if (!memberToken) return ''
  await httpReducer('org_accept_invite', [inviteToken], memberToken)
  await delay(300)
  const members = await httpQuery('org_member', ctx.token)
  const orgMembers = members.filter(m => Number(m.org_id) === toU32(orgId))
  const member = orgMembers.find(m => str(m.user_id).includes(_userId.slice(0, 20))) ?? orgMembers.at(-1)
  return member ? str(member.id) : ''
}
const removeTestOrgMember = async (orgId: string, _userId: string): Promise<void> => {
  const ctx = getHttpCtx()
  const members = await httpQuery('org_member', ctx.token)
  const filtered = members.filter(m => Number(m.org_id) === toU32(orgId))
  const target = filtered.find(m => str(m.user_id).includes(_userId.slice(0, 20)))
  if (target) await httpReducer('org_remove_member', [target.id], ctx.token)
}
const resolveApiPath = (apiRef: unknown): string => {
  const raw = typeof apiRef === 'string' ? apiRef : (apiRef as string)
  const match = API_PATH_RE.exec(raw)
  if (match?.groups) return `${match.groups.mod}.${match.groups.fn}`
  return raw
}
const makeOrgTestUtils = (prefix: string) => ({
  cleanupOrgTestData: async () => {
    try {
      const { token } = getHttpCtx()
      const invites = await httpQuery('org_invite', token)
      for (const inv of invites)
        try {
          await httpReducer('org_revoke_invite', [inv.id], token)
        } catch {
          /* */
        }
      const orgs = await httpQuery('org', token)
      for (const org of orgs)
        try {
          await httpReducer('org_remove', [org.id], token)
        } catch {
          /* */
        }
    } catch {
      /* */
    }
  },
  cleanupTestUsers: async () => {
    await Promise.resolve()
  },
  generateSlug: (suffix: string) => `${prefix}-${suffix}-${Date.now()}`
})
const setupOrg = (testPrefix: string, orgName: string, orgSlugSuffix: string) => {
  const utils = makeOrgTestUtils(testPrefix)
  let orgId = ''
  let orgSlug = ''
  return {
    ...utils,
    afterAll: async () => {
      await utils.cleanupOrgTestData()
    },
    beforeAll: async () => {
      await ensureTestUser()
      orgSlug = utils.generateSlug(orgSlugSuffix)
      const result = await createTestOrg(orgSlug, orgName)
      ;({ orgId } = result)
      return { orgId, orgSlug }
    },
    get orgId() {
      return orgId
    },
    get orgSlug() {
      return orgSlug
    }
  }
}
const buildMutationArgs = (apiPath: string, args: Record<string, unknown>): unknown[] => {
  const data = (args.data ?? args) as Record<string, unknown>
  switch (apiPath) {
    case 'org.acceptInvite':
      return [str(args.token)]
    case 'org.create':
      return [toOption(data.avatarId), str(data.name), str(data.slug)]
    case 'org.invite':
      return [str(args.email), Boolean(args.isAdmin), toU32(args.orgId)]
    case 'org.leave':
      return [toU32(args.orgId)]
    case 'org.remove':
      return [toU32(args.orgId ?? data.orgId)]
    case 'org.removeMember':
      return [toU32(args.memberId)]
    case 'org.revokeInvite':
      return [toU32(args.inviteId)]
    case 'org.setAdmin':
      return [Boolean(args.isAdmin), toU32(args.memberId)]
    case 'org.transferOwnership':
      return [toU32(args.newOwnerId), toU32(args.orgId)]
    case 'org.update':
      return [toU32(args.orgId ?? data.orgId), toOption(data.avatarId), toOption(data.name), toOption(data.slug)]
    case 'orgProfile.upsert':
      return [
        toOption(data.avatar),
        toOption(data.bio),
        toOption(data.displayName),
        toOption(data.notifications),
        toOption(data.theme)
      ]
    case 'project.create':
      return [toU32(args.orgId), toOption(args.description), str(args.name), toOption(args.status), toOption(undefined)]
    case 'project.rm':
      return [toU32(args.id)]
    case 'project.update':
      return [
        toU32(args.id),
        toDoubleOption(args.description),
        toOption(args.name),
        toDoubleOption(args.status),
        toOption(undefined),
        toOption(args.expectedUpdatedAt)
      ]
    case 'task.create':
      return [
        toU32(args.orgId),
        toOption(args.completed),
        toOption(args.priority),
        toU32(args.projectId ?? 0),
        str(args.title),
        toOption(undefined)
      ]
    case 'task.rm':
      return [toU32(args.id)]
    case 'task.toggle':
      return [toU32(args.id), { some: { some: true } }, { none: [] }, { none: [] }, { none: [] }, { none: [] }]
    case 'wiki.create':
      return [
        toU32(args.orgId),
        toOption(args.content),
        str(args.slug),
        str(args.status) || 'draft',
        str(args.title),
        toOption(undefined)
      ]
    case 'wiki.rm':
      return [toU32(args.id)]
    case 'wiki.update':
      return [
        toU32(args.id),
        toDoubleOption(args.content),
        toOption(args.slug),
        toOption(args.status),
        toOption(args.title),
        toOption(undefined),
        toOption(args.expectedUpdatedAt)
      ]
    default:
      return Object.values(data)
  }
}
const queryRows = async (apiPath: string, args: Record<string, unknown>): Promise<unknown> => {
  const { token } = getHttpCtx()
  const queryTableMap: Record<string, string> = {
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
  }
  const tableName = queryTableMap[apiPath]
  if (!tableName) throw new Error(`No table mapping for query ${apiPath}`)
  const rawRows = await httpQuery(tableName, token)
  const rows = rawRows.map(r => normalizeRow(r))
  if (apiPath === 'org.get') {
    const id = args.orgId ?? args.id
    return rows.find(r => String(r.id) === String(id)) ?? null
  }
  if (apiPath === 'org.getBySlug') return rows.find(r => r.slug === args.slug) ?? null
  if (apiPath === 'org.myOrgs')
    return rows.map(o => ({
      org: { ...o, _id: String(o.id) },
      role: 'owner'
    }))
  if (apiPath === 'org.members') {
    const filtered = rows.filter(r => String(r.orgId) === String(args.orgId))
    const orgRows = await httpQuery('org', getHttpCtx().token)
    const normalizedOrg = orgRows.map(r => normalizeRow(r)).find(o => String(o.id) === String(args.orgId))
    const ownerUserId = normalizedOrg?.userId ? str(normalizedOrg.userId) : ''
    return filtered.map(m =>
      Object.assign(m, {
        role: str(m.userId) === ownerUserId ? 'owner' : m.isAdmin ? 'admin' : 'member',
        userId: m.userId ? str(m.userId) : undefined
      })
    )
  }
  if (apiPath === 'org.membership') {
    const orgMembers = rows.filter(r => String(r.orgId) === String(args.orgId))
    const orgRows = await httpQuery('org', getHttpCtx().token)
    const normalizedOrgs = orgRows.map(r => normalizeRow(r))
    const org = normalizedOrgs.find(o => String(o.id) === String(args.orgId))
    if (org) {
      const result: MembershipResult = {
        role: 'owner',
        userId: org.userId ? str(org.userId) : undefined
      }
      return result
    }
    if (orgMembers.length > 0) {
      const m = orgMembers[0]
      if (m) {
        const result: MembershipResult = {
          role: m.isAdmin ? 'admin' : 'member',
          userId: m.userId ? str(m.userId) : undefined
        }
        return result
      }
    }
    return null
  }
  if (apiPath === 'org.pendingInvites') return rows.filter(r => String(r.orgId) === String(args.orgId))
  if (apiPath === 'orgProfile.get') {
    try {
      const fs = await import('node:fs')
      const tokenFileContent = fs.readFileSync(`${process.cwd()}/e2e/.stdb-test-token.json`, 'utf8')
      const parsed = JSON.parse(tokenFileContent) as IdentityResponse
      const { identity } = parsed
      const match = rows.find(r => String(r.userId).includes(identity) || String(r.user_id).includes(identity))
      if (match) return match
    } catch {
      /* */
    }
    return rows[0] ?? null
  }
  if (apiPath === 'project.read') {
    const found = rows.find(r => String(r.id) === String(args.id) && String(r.orgId) === String(args.orgId))
    if (!found) throw new Error('REDUCER_CALL_FAILED(query): NOT_FOUND')
    return found
  }
  if (apiPath === 'task.read') {
    const found = rows.find(r => String(r.id) === String(args.id))
    if (!found) throw new Error('REDUCER_CALL_FAILED(query): NOT_FOUND')
    return found
  }
  if (apiPath === 'wiki.read') {
    const found = rows.find(r => String(r.id) === String(args.id))
    if (!found) throw new Error('REDUCER_CALL_FAILED(query): NOT_FOUND')
    return found
  }
  if (apiPath === 'project.list') {
    const filtered = args.orgId ? rows.filter(r => String(r.orgId) === String(args.orgId)) : rows
    const result: ListResult = { isDone: true, page: filtered }
    return result
  }
  if (apiPath === 'wiki.list') {
    const filtered = rows.filter(r => {
      const matchOrg = args.orgId ? str(r.orgId) === str(args.orgId) : true
      const notDeleted = r.deletedAt === undefined || r.deletedAt === null
      return matchOrg && notDeleted
    })
    const result: ListResult = { isDone: true, page: filtered }
    return result
  }
  return rows
}
const mutationReducerMap: Record<string, string> = {
  'org.acceptInvite': 'org_accept_invite',
  'org.create': 'org_create',
  'org.invite': 'org_send_invite',
  'org.leave': 'org_leave',
  'org.remove': 'org_remove',
  'org.removeMember': 'org_remove_member',
  'org.revokeInvite': 'org_revoke_invite',
  'org.setAdmin': 'org_set_admin',
  'org.transferOwnership': 'org_transfer_ownership',
  'org.update': 'org_update',
  'orgProfile.upsert': 'upsert_orgProfile',
  'project.create': 'create_project',
  'project.rm': 'rm_project',
  'project.update': 'update_project',
  'task.create': 'create_task',
  'task.rm': 'rm_task',
  'task.toggle': 'update_task',
  'wiki.create': 'create_wiki',
  'wiki.rm': 'rm_wiki',
  'wiki.update': 'update_wiki'
}
const handleMutationResult = async (apiPath: string, args: Record<string, unknown>, token: string): Promise<unknown> => {
  if (apiPath === 'org.create') {
    const data = (args.data ?? args) as Record<string, unknown>
    const orgs = await httpQuery('org', token)
    const org = orgs.find(o => o.slug === data.slug)
    const result: OrgCreateResult = { orgId: org ? String(org.id) : '' }
    return result
  }
  if (apiPath === 'org.invite') {
    const invites = await httpQuery('org_invite', token)
    const filtered = invites.filter(i => Number(i.org_id) === toU32(args.orgId))
    const latest = filtered.at(-1)
    if (latest) {
      const result: InviteResult = {
        inviteId: String(latest.id),
        token: String(latest.token)
      }
      return result
    }
    const empty: InviteResult = { inviteId: '', token: '' }
    return empty
  }
  if (apiPath === 'project.create') {
    const projects = await httpQuery('project', token)
    const filtered = projects.filter(p => Number(p.org_id) === toU32(args.orgId))
    let maxId = 0
    for (const p of filtered) {
      const pid = Number(p.id)
      if (pid > maxId) maxId = pid
    }
    return maxId > 0 ? String(maxId) : ''
  }
  if (apiPath === 'project.update') {
    const projects = await httpQuery('project', token)
    const found = projects.find(p => Number(p.id) === toU32(args.id))
    if (found) return normalizeRow(found)
    return
  }
  if (apiPath === 'task.create') {
    const tasks = await httpQuery('task', token)
    const filtered = tasks.filter(t => Number(t.org_id) === toU32(args.orgId))
    let maxId = 0
    for (const t of filtered) {
      const tid = Number(t.id)
      if (tid > maxId) maxId = tid
    }
    return maxId > 0 ? String(maxId) : ''
  }
  if (apiPath === 'task.toggle') {
    const tasks = await httpQuery('task', token)
    const found = tasks.find(t => Number(t.id) === toU32(args.id))
    if (found) return normalizeRow(found)
    return
  }
  if (apiPath === 'wiki.create') {
    const wikis = await httpQuery('wiki', token)
    const filtered = wikis.filter(w => Number(w.org_id) === toU32(args.orgId))
    let maxId = 0
    for (const w of filtered) {
      const wid = Number(w.id)
      if (wid > maxId) maxId = wid
    }
    return maxId > 0 ? String(maxId) : ''
  }
}
const makeTc = () => ({
  mutation: async <T>(apiRef: unknown, args: Record<string, unknown>): Promise<T> => {
    const { token } = getHttpCtx()
    const apiPath = resolveApiPath(apiRef)
    const reducerName = mutationReducerMap[apiPath]
    if (!reducerName) throw new Error(`No reducer mapping for ${apiPath}`)
    if (apiPath === 'project.rm' && Array.isArray(args.ids)) {
      let count = 0
      for (const id of args.ids) {
        await httpReducer('rm_project', [toU32(id)], token)
        count += 1
      }
      await delay(200)
      return count as T
    }
    if (apiPath === 'wiki.rm' && Array.isArray(args.ids)) {
      for (const id of args.ids) await httpReducer('rm_wiki', [toU32(id)], token)
      await delay(200)
      return undefined as T
    }
    const reducerArgs = buildMutationArgs(apiPath, args)
    await httpReducer(reducerName, reducerArgs, token)
    await delay(300)
    return (await handleMutationResult(apiPath, args, token)) as T
  },
  query: async <T>(apiRef: unknown, args: Record<string, unknown>): Promise<T> => {
    const apiPath = resolveApiPath(apiRef)
    return (await queryRows(apiPath, args)) as T
  },
  raw: {
    mutation: async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
      const { token } = getHttpCtx()
      const cleanName = name.includes(':') ? (name.split(':')[1] ?? name) : name
      if (cleanName === 'requestJoinAsUser') {
        const userToken = userTokens.get(str(args.userId)) ?? token
        await httpReducer('org_request_join', [toOption(args.message), toU32(args.orgId)], userToken)
        return undefined as T
      }
      if (cleanName === 'create') {
        const data = (args.data ?? args) as Record<string, unknown>
        await httpReducer('org_create', [{ none: [] }, str(data.name), str(data.slug)], token)
        return undefined as T
      }
      await httpReducer(camelToSnake(cleanName), Object.values(args), token)
      return undefined as T
    },
    query: async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
      const { token } = getHttpCtx()
      const cleanName = name.includes(':') ? (name.split(':')[1] ?? name) : name
      const tableName = typeof args.table === 'string' ? args.table : camelToSnake(cleanName)
      const rows = await httpQuery(tableName, token)
      return rows as T
    }
  }
})
const tc = makeTc()
const api = new Proxy(
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
) as {
  org: {
    acceptInvite: string
    approveJoin: string
    create: string
    get: string
    getBySlug: string
    invite: string
    leave: string
    members: string
    membership: string
    myOrgs: string
    pendingInvites: string
    rejectJoin: string
    remove: string
    removeMember: string
    revokeInvite: string
    setAdmin: string
    transferOwnership: string
    update: string
  }
  orgProfile: { get: string; upsert: string }
  project: { create: string; list: string; read: string; rm: string; update: string }
  task: { create: string; read: string; rm: string; toggle: string }
  testauth: { cleanupOrgTestData: string; cleanupTestData: string; ensureTestUser: string; requestJoinAsUser: string }
  wiki: { create: string; list: string; read: string; rm: string; update: string }
}
const cleanupAll = async () => {
  await Promise.resolve()
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
