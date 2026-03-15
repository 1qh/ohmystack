import { zid } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'

import { crud, q } from '../lazy'
import { internalMutation } from './_generated/server'
import { enforceRateLimit } from './rateLimit'
import { owned } from '../t'

interface IndexEq {
  eq: (field: string, value: unknown) => IndexEq
}

interface McpHookCtx {
  db: {
    query: (table: 'mcpServers') => {
      withIndex: (name: 'by_user_name', fn: (i: IndexEq) => unknown) => { collect: () => Promise<Record<string, unknown>[]> }
    }
  }
  userId: string
}

const validateMcpUrl = (url: string) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('invalid_url_protocol')
    const hostname = parsed.hostname.toLowerCase(),
      blocked = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', '[::1]', 'metadata.google.internal']
    if (
      blocked.includes(hostname) ||
      hostname.endsWith('.internal') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.')
    )
      throw new Error('blocked_url')
  },
  parseCachedToolNames = ({ cachedTools }: { cachedTools?: string }) => {
    if (!cachedTools) return []
    try {
      const parsed = JSON.parse(cachedTools) as unknown
      if (!Array.isArray(parsed)) return []
      const names: string[] = []
      for (const t of parsed) {
        if (typeof t === 'string') {
          names.push(t)
          continue
        }
        if (typeof t === 'object' && t && 'name' in t && typeof t.name === 'string') names.push(t.name)
      }
      return names
    } catch (_error) {
      return []
    }
  },
  redactServer = (doc: null | Record<string, unknown>) => {
    if (!doc) return null
    const { authHeaders, ...rest } = doc
    return { ...rest, hasAuthHeaders: Boolean(authHeaders) }
  },
  hooks = {
    afterRead: (_ctx: unknown, { doc }: { doc: null | Record<string, unknown> }) => redactServer(doc),
    beforeCreate: async (ctx: McpHookCtx, { data }: { data: Record<string, unknown> }) => {
      const name = data.name
      if (typeof name !== 'string') throw new Error('name_required')
      const url = data.url
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
      { id, patch, prev }: { id: string; patch: Record<string, unknown>; prev: Record<string, unknown> }
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
      if (!doc || doc.userId !== ctx.user._id) return null
      return hooks.afterRead(ctx, { doc: doc as never })
    }
  }),
  list = q({
    args: {},
    handler: async ctx => {
      const docs = await ctx.db
        .query('mcpServers')
        .withIndex('by_user_name', i => i.eq('userId', ctx.user._id as never))
        .collect()
      const out: ReturnType<typeof redactServer>[] = []
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
        .collect()
      const tools: { serverName: string; toolName: string }[] = []
      for (const server of servers) {
        const toolNames = parseCachedToolNames({ cachedTools: server.cachedTools })
        for (const toolName of toolNames) tools.push({ serverName: server.name, toolName })
      }
      return { tools }
    }
  }),
  mcpCallTool = internalMutation({
    args: {
      serverName: v.string(),
      sessionId: v.id('session'),
      toolArgs: v.string(),
      toolName: v.string()
    },
    handler: async (ctx, { serverName, sessionId }) => {
      const session = await ctx.db.get(sessionId)
      if (!session) throw new Error('session_not_found')
      await enforceRateLimit({
        ctx,
        key: String(session.userId),
        name: 'mcpCall'
      })
      const server = await ctx.db
        .query('mcpServers')
        .withIndex('by_user_name', idx => idx.eq('userId', session.userId).eq('name', serverName))
        .first()
      if (!server || !server.isEnabled) throw new Error('mcp_server_not_found')
      const isTestMode = process.env.CONVEX_TEST_MODE === 'true'
      if (isTestMode) return { content: 'mock MCP result', ok: true as const }
      throw new Error('mcp_not_implemented')
    }
  })

export { create, list, mcpCallTool, mcpDiscover, read, rm, update }
