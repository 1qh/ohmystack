// biome-ignore-all lint/style/noProcessEnv: test env
// biome-ignore-all lint/suspicious/useAwait: test async
// oxlint-disable promise/avoid-new
import { DbConnectionBuilder, DbConnectionImpl } from 'spacetimedb/sdk'

interface CreateTestContextOptions {
  httpUrl?: string
  moduleName?: string
  userCount?: number
  wsUrl?: string
}

interface SchemaReducer {
  name?: string
  params?: {
    elements?: SchemaReducerParam[]
  }
}

interface SchemaReducerParam {
  name?: { some?: string }
}

interface SchemaResponse {
  reducers?: SchemaReducer[]
}

interface SqlStatementResult {
  rows?: unknown[]
  schema?: unknown
}

interface TestContext {
  baseHttpUrl: string
  baseWsUrl: string
  defaultUser: TestUser
  moduleName: string
  reducerParams: Map<string, string[]>
  users: TestUser[]
}

interface TestUser {
  connection: DbConnectionImpl<typeof REMOTE_MODULE>
  identity: string
  token: string
}

const DEFAULT_HTTP_URL = 'http://localhost:3000',
   DEFAULT_MODULE_NAME = '@ohmystack/spacetimedb',
  DEFAULT_WS_URL = 'ws://localhost:3000',
  CONNECT_TIMEOUT_MS = 10_000,
  IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/u,
  isTestMode = () => process.env.SPACETIMEDB_TEST_MODE === 'true',
  REMOTE_MODULE = {
    procedures: [],
    reducers: [],
    tables: {},
    versionInfo: { cliVersion: '2.0.0' }
  },
  toHttpUrl = (wsUrl: string): string => {
    if (wsUrl.startsWith('ws://')) return `http://${wsUrl.slice('ws://'.length)}`
    if (wsUrl.startsWith('wss://')) return `https://${wsUrl.slice('wss://'.length)}`
    return wsUrl
  },
  parseJsonResponse = async <T>(response: Response): Promise<T> => {
    const text = await response.text()
    if (!response.ok) {
      const message = text.trim().length > 0 ? text : response.statusText
      throw new Error(`HTTP_${String(response.status)}: ${message}`)
    }
    if (text.trim().length === 0) return null as T
    return JSON.parse(text) as T
  },
  getReducerParamMap = (schema: SchemaResponse): Map<string, string[]> => {
    const map = new Map<string, string[]>(),
      reducers = schema.reducers ?? []
    for (const reducer of reducers) {
      const reducerName = reducer.name
      if (reducerName) {
        const params: string[] = [],
          elements = reducer.params?.elements ?? []
        for (const el of elements) {
          const paramName = el.name?.some
          if (paramName) params.push(paramName)
        }
        map.set(reducerName, params)
      }
    }
    return map
  },
  getSchema = async (ctx: Pick<TestContext, 'baseHttpUrl' | 'moduleName'>): Promise<SchemaResponse> => {
    const response = await fetch(`${ctx.baseHttpUrl}/v1/database/${ctx.moduleName}/schema?version=9`)
    return parseJsonResponse<SchemaResponse>(response)
  },
  createConnectedUser = async (ctx: Pick<TestContext, 'baseWsUrl' | 'moduleName'>): Promise<TestUser> => {
    const builder = new DbConnectionBuilder(REMOTE_MODULE, config => new DbConnectionImpl(config))
    return new Promise<TestUser>((resolve, reject) => {
      let finished = false
      const timeout = setTimeout(() => {
        if (finished) return
        finished = true
        reject(new Error('CONNECT_TIMEOUT: failed to connect to SpacetimeDB'))
      }, CONNECT_TIMEOUT_MS)

      builder
        .withUri(ctx.baseWsUrl)
        .withDatabaseName(ctx.moduleName)
        .onConnect((connection, identity, token) => {
          if (finished) return
          finished = true
          clearTimeout(timeout)
          resolve({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            connection,
            identity: identity.toHexString(),
            token
          })
        })
        .onConnectError((_connection, error) => {
          if (finished) return
          finished = true
          clearTimeout(timeout)
          reject(new Error(`CONNECT_FAILED: ${error.message}`))
        })
        .build()
    })
  },
  ensureIdentifier = (value: string, kind: string): string => {
    const valid = IDENTIFIER_RE.test(value)
    if (!valid) throw new Error(`INVALID_${kind}: ${value}`)
    return value
  },
  normalizeReducerArgs = (ctx: TestContext, reducerName: string, args?: unknown): unknown[] => {
    if (args === undefined || args === null) return []
    if (Array.isArray(args)) return args
    if (typeof args !== 'object') return [args]
    const reducerParams = ctx.reducerParams.get(reducerName)
    if (!reducerParams) throw new Error(`REDUCER_NOT_FOUND: ${reducerName}`)
    const argRecord = args as Record<string, unknown>,
      values: unknown[] = []
    for (const name of reducerParams) values.push(argRecord[name])
    return values
  },
  getSqlFields = (schema: unknown): string[] => {
    if (!schema || typeof schema !== 'object') return []
    const schemaRecord = schema as Record<string, unknown>,
      directElements = schemaRecord.elements,
      productElements =
        schemaRecord.Product && typeof schemaRecord.Product === 'object'
          ? (schemaRecord.Product as Record<string, unknown>).elements
          : undefined,
      fields: string[] = [],
      elementsSource = Array.isArray(directElements)
        ? directElements
        : Array.isArray(productElements)
          ? productElements
          : []
    for (const item of elementsSource)
      if (item && typeof item === 'object') {
        const itemRecord = item as Record<string, unknown>,
          nameValue = itemRecord.name
        if (nameValue && typeof nameValue === 'object') {
          const { some } = nameValue as { some?: unknown }
          if (typeof some === 'string') fields.push(some)
        }
      }
    return fields
  },
  rowToObject = (row: unknown, fields: string[]): unknown => {
    if (!Array.isArray(row) || fields.length === 0 || fields.length !== row.length) return row
    const result: Record<string, unknown> = {},
      rowValues: readonly unknown[] = row
    for (let i = 0; i < fields.length; i += 1) {
      const fieldName = fields[i],
        value = rowValues[i]
      if (fieldName) result[fieldName] = value
    }
    return result
  },
  postSql = async (ctx: TestContext, query: string, token: string): Promise<SqlStatementResult[]> => {
    const response = await fetch(`${ctx.baseHttpUrl}/v1/database/${ctx.moduleName}/sql`, {
        body: query,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain'
        },
        method: 'POST'
      }),
      parsed = await parseJsonResponse<SqlStatementResult | SqlStatementResult[]>(response)
    if (Array.isArray(parsed)) return parsed
    return [parsed]
  },
  postReducer = async (
    ctx: TestContext,
    request: { args: unknown[]; reducerName: string; token: string }
  ): Promise<unknown> => {
    const safeReducer = ensureIdentifier(request.reducerName, 'REDUCER_NAME'),
      response = await fetch(`${ctx.baseHttpUrl}/v1/database/${ctx.moduleName}/call/${safeReducer}`, {
        body: JSON.stringify(request.args),
        headers: {
          Authorization: `Bearer ${request.token}`,
          'Content-Type': 'application/json'
        },
        method: 'POST'
      }),
      text = await response.text()
    if (!response.ok) {
      const message = text.trim().length > 0 ? text : response.statusText
      throw new Error(`REDUCER_CALL_FAILED: ${message}`)
    }
    if (text.trim().length === 0) return null
    const parsed: unknown = JSON.parse(text)
    return parsed
  },
  createTestContext = async (options?: CreateTestContextOptions): Promise<TestContext> => {
    const baseWsUrl = options?.wsUrl ?? DEFAULT_WS_URL,
      baseHttpUrl = options?.httpUrl ?? (toHttpUrl(baseWsUrl) || DEFAULT_HTTP_URL),
      moduleName = options?.moduleName ?? DEFAULT_MODULE_NAME,
      userCount = options?.userCount ?? 1,
      defaultUser = await createConnectedUser({ baseWsUrl, moduleName }),
      ctx: TestContext = {
        baseHttpUrl,
        baseWsUrl,
        defaultUser,
        moduleName,
        reducerParams: new Map<string, string[]>(),
        users: [defaultUser]
      },
      schema = await getSchema(ctx)

    ctx.reducerParams = getReducerParamMap(schema)

    const pendingUsers: Promise<TestUser>[] = []
    for (let i = 1; i < userCount; i += 1) pendingUsers.push(createConnectedUser(ctx))
    const additionalUsers = await Promise.all(pendingUsers)
    for (const user of additionalUsers) ctx.users.push(user)
    return ctx
  },
  createTestUser = async (ctx: TestContext): Promise<TestUser> => {
    const user = await createConnectedUser(ctx)
    ctx.users.push(user)
    return user
  },
  asUser = async <T>(_ctx: TestContext, user: TestUser, fn: (activeUser: TestUser) => Promise<T>): Promise<T> => fn(user),
  callReducer = async (ctx: TestContext, name: string, ...rest: [args?: unknown, user?: TestUser]): Promise<unknown> => {
    const [args, user] = rest,
      activeUser = user ?? ctx.defaultUser,
      safeName = ensureIdentifier(name, 'REDUCER_NAME'),
      callArgs = normalizeReducerArgs(ctx, safeName, args)
    return postReducer(ctx, {
      args: callArgs,
      reducerName: safeName,
      token: activeUser.token
    })
  },
  queryTable = async (ctx: TestContext, tableName: string, user?: TestUser): Promise<unknown[]> => {
    const activeUser = user ?? ctx.defaultUser,
      safeTableName = ensureIdentifier(tableName, 'TABLE_NAME'),
      sql = `SELECT * FROM ${safeTableName}`,
      results = await postSql(ctx, sql, activeUser.token)
    if (results.length === 0) return []
    const [first] = results,
      rows = first?.rows ?? [],
      fields = getSqlFields(first?.schema),
      mapped: unknown[] = []
    for (const row of rows) mapped.push(rowToObject(row, fields))
    return mapped
  },
  cleanup = async (ctx: TestContext): Promise<void> => {
    if (ctx.reducerParams.has('reset_all_data'))
      await postReducer(ctx, {
        args: [],
        reducerName: 'reset_all_data',
        token: ctx.defaultUser.token
      })
    for (const user of ctx.users) user.connection.disconnect()
    ctx.users.length = 0
  }

export type { ErrorData } from './helpers'
export {
  extractErrorData,
  getErrorCode,
  getErrorDetail,
  getErrorMessage
} from './helpers'

export type { TestContext, TestUser }
export { asUser, callReducer, cleanup, createTestContext, createTestUser, isTestMode, queryTable }
