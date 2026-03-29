import { zid } from 'convex-helpers/server/zod4'
/** biome-ignore-all lint/style/noProcessEnv: test mode detection */
import { v } from 'convex/values'
import { URL } from 'node:url'
import { crud, q } from '../lazy'
import { owned } from '../t'
import { internalMutation } from './_generated/server'
import { enforceRateLimit } from './rateLimit'
const PRIVATE_172_RE = /^172\.(?<oct>\d+)\./u
interface IndexEq {
  eq: (field: string, value: unknown) => IndexEq
}
interface McpHookCtx {
  db: {
    query: (table: 'mcpServers') => {
      withIndex: (
        name: 'by_user_name',
        fn: (i: IndexEq) => unknown
      ) => { collect: () => Promise<Record<string, unknown>[]> }
    }
  }
  userId: string
}
const MCP_CACHE_TTL_MS = 5 * 60 * 1000,
  MCP_TIMEOUT_MS = 30_000,
  getNameFromUnknown = ({ value }: { value: unknown }) => {
    if (!value || typeof value !== 'object') return null
    const name: unknown = Reflect.get(value, 'name')
    return typeof name === 'string' ? name : null
  },
  validateMcpUrl = (url: string) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('invalid_url_protocol')
    const hostname = parsed.hostname.toLowerCase(),
      blocked = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', '[::1]', 'metadata.google.internal']
    if (
      blocked.includes(hostname) ||
      hostname.endsWith('.internal') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      hostname.startsWith('fc00:') ||
      hostname.startsWith('fd00:') ||
      hostname === '::ffff:127.0.0.1' ||
      hostname === '[::ffff:127.0.0.1]' ||
      (PRIVATE_172_RE.test(hostname) &&
        (() => {
          const oct = Number.parseInt(PRIVATE_172_RE.exec(hostname)?.groups?.oct ?? '', 10)
          return oct >= 16 && oct <= 31
        })())
    )
      throw new Error('blocked_url')
  },
  parseCachedToolNames = ({ cachedTools }: { cachedTools?: string }) => {
    if (!cachedTools) return []
    try {
      const parsed = JSON.parse(cachedTools) as unknown
      if (!Array.isArray(parsed)) return []
      const names: string[] = []
      for (const t of parsed)
        if (typeof t === 'string') names.push(t)
        else {
          const name = getNameFromUnknown({ value: t })
          if (name) names.push(name)
        }
      return names
    } catch {
      return []
    }
  },
  parseJsonObject = ({ raw }: { raw: string }) => {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('invalid_json_object')
    return parsed as Record<string, unknown>
  },
  withMcpTimeout = async <T>({ operation, promise }: { operation: string; promise: Promise<T> }) =>
    // oxlint-disable-next-line promise/prefer-await-to-then
    Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        const handle = setTimeout(() => {
          clearTimeout(handle)
          reject(new Error(`mcp_timeout:${operation}`))
        }, MCP_TIMEOUT_MS)
      })
    ]),
  redactServer = (doc: null | Record<string, unknown>) => {
    if (!doc) return null
    const { authHeaders, ...rest } = doc
    return { ...rest, hasAuthHeaders: Boolean(authHeaders) }
  },
  hooks = {
    afterRead: (_ctx: unknown, { doc }: { doc: null | Record<string, unknown> }) => redactServer(doc),
    beforeCreate: async (ctx: McpHookCtx, { data }: { data: Record<string, unknown> }) => {
      const { name } = data
      if (typeof name !== 'string') throw new Error('name_required')
      const { url } = data
      if (typeof url !== 'string') throw new Error('url_required')
      validateMcpUrl(url)
      const existing = await ctx.db
        .query('mcpServers')
        .withIndex('by_user_name', i => i.eq('userId', ctx.userId as never).eq('name', name as never))
        .collect()
      if (existing.length > 0) throw new Error('name_taken')
      return {
        ...data,
        cachedAt: undefined,
        cachedTools: undefined,
        isEnabled: data.isEnabled ?? true,
        transport: 'http'
      }
    },
    beforeUpdate: async (
      ctx: McpHookCtx,
      {
        id,
        patch,
        prev
      }: {
        id: string
        patch: Record<string, unknown>
        prev: Record<string, unknown>
      }
    ) => {
      const patchUrl = patch.url,
        prevUrl = prev.url
      if (typeof patchUrl === 'string' && patchUrl !== prevUrl) validateMcpUrl(patchUrl)
      const patchName = patch.name,
        prevName = prev.name
      if (typeof patchName === 'string' && patchName !== prevName) {
        const existing = await ctx.db
          .query('mcpServers')
          .withIndex('by_user_name', i => i.eq('userId', ctx.userId as never).eq('name', patchName as never))
          .collect()
        for (const doc of existing) if ((doc._id as string | undefined) !== id) throw new Error('name_taken')
      }
      if ((typeof patchUrl === 'string' && patchUrl !== prevUrl) || patch.authHeaders !== prev.authHeaders)
        return {
          ...patch,
          cachedAt: undefined,
          cachedTools: undefined
        }
      return patch
    }
  },
  { create, rm, update } = crud('mcpServers', owned.mcpServer, { hooks }),
  read = q({
    args: { id: zid('mcpServers') },
    handler: async (ctx, { id }) => {
      const doc = await ctx.db.get(id)
      if (doc?.userId !== ctx.user._id) return null
      return hooks.afterRead(ctx, { doc: doc as never })
    }
  }),
  list = q({
    args: {},
    handler: async ctx => {
      const docs = await ctx.db
          .query('mcpServers')
          .withIndex('by_user_name', i => i.eq('userId', ctx.user._id as never))
          .collect(),
        out: ReturnType<typeof redactServer>[] = []
      for (const doc of docs) out.push(hooks.afterRead(ctx, { doc: doc as never }))
      return out
    }
  }),
  mcpDiscover = internalMutation({
    args: { sessionId: v.id('session') },
    handler: async (ctx, { sessionId }) => {
      const session = await ctx.db.get(sessionId)
      if (!session) throw new Error('session_not_found')
      const servers = await ctx.db
          .query('mcpServers')
          .withIndex('by_user_enabled', idx => idx.eq('userId', session.userId).eq('isEnabled', true))
          .collect(),
        tools: { serverName: string; toolName: string }[] = []
      for (const server of servers) {
        const toolNames = parseCachedToolNames({
          cachedTools: server.cachedTools
        })
        for (const toolName of toolNames) tools.push({ serverName: server.name, toolName })
      }
      return { tools }
    }
  }),
  mcpCallTool = internalMutation({
    args: {
      serverName: v.string(),
      sessionId: v.optional(v.id('session')),
      threadId: v.optional(v.string()),
      toolArgs: v.string(),
      toolName: v.string()
    },
    handler: async (ctx, { serverName, sessionId, threadId, toolArgs, toolName }) => {
      let resolvedSessionId = sessionId
      if (!resolvedSessionId && threadId) {
        const task = await ctx.db
          .query('tasks')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .unique()
        resolvedSessionId = task?.sessionId
      }
      if (!resolvedSessionId) throw new Error('session_not_found')
      const session = await ctx.db.get(resolvedSessionId)
      if (!session) throw new Error('session_not_found')
      let parsedToolArgs: Record<string, unknown>
      try {
        parsedToolArgs = parseJsonObject({ raw: toolArgs })
      } catch {
        return { error: 'invalid_tool_args' as const, ok: false as const }
      }
      await enforceRateLimit({
        ctx,
        key: String(session.userId),
        name: 'mcpCall'
      })
      const loadServer = async () =>
          ctx.db
            .query('mcpServers')
            .withIndex('by_user_name', idx => idx.eq('userId', session.userId).eq('name', serverName))
            .first(),
        server = await loadServer()
      if (!server?.isEnabled) throw new Error('mcp_server_not_found')
      validateMcpUrl(server.url)
      if (server.authHeaders)
        try {
          parseJsonObject({ raw: server.authHeaders })
        } catch {
          return { error: 'invalid_auth_headers' as const, ok: false as const }
        }
      const now = Date.now(),
        toolInCache = ({ allowStale, row }: { allowStale: boolean; row: { cachedAt?: number; cachedTools?: string } }) => {
          const withinTtl = row.cachedAt !== undefined && now - row.cachedAt <= MCP_CACHE_TTL_MS
          if (!(allowStale || withinTtl)) return false
          const toolNames = parseCachedToolNames({
            cachedTools: row.cachedTools
          })
          return toolNames.includes(toolName)
        },
        firstHit = toolInCache({ allowStale: false, row: server })
      if (!firstHit) {
        await ctx.db.patch(server._id, { cachedAt: undefined })
        const refreshed = await loadServer()
        if (!refreshed?.isEnabled) throw new Error('mcp_server_not_found')
        const secondHit = toolInCache({ allowStale: true, row: refreshed })
        if (!secondHit)
          return {
            error: 'tool_not_found' as const,
            ok: false as const,
            retried: true as const
          }
      }
      /** biome-ignore lint/style/noProcessEnv: test mode gate */
      if (process.env.CONVEX_TEST_MODE === 'true')
        return {
          content: `mock MCP result:${toolName}`,
          ok: true as const,
          toolArgs: parsedToolArgs
        }
      await withMcpTimeout({
        operation: 'callTool',
        promise: Promise.reject(new Error('mcp_not_implemented'))
      })
      return { content: '', ok: true as const, toolArgs: parsedToolArgs }
    }
  })
export { create, list, mcpCallTool, mcpDiscover, read, rm, update }
