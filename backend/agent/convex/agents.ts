import type { ToolSet } from 'ai'
import { tool } from 'ai'
import { makeFunctionReference } from 'convex/server'
import { z } from 'zod/v4'
import type { Id } from './_generated/dataModel'
import type { ActionCtx } from './_generated/server'
const spawnTaskRef = makeFunctionReference<
  'mutation',
  {
    description: string
    isBackground: boolean
    parentThreadId: string
    prompt: string
    sessionId: Id<'session'>
  },
  { taskId: Id<'tasks'>; threadId: string }
>('tasks:spawnTask')
const getOwnedTaskStatusInternalRef = makeFunctionReference<
  'query',
  { taskId: string },
  null | { description: string; status: 'cancelled' | 'completed' | 'failed' | 'pending' | 'running' | 'timed_out' }
>('tasks:getOwnedTaskStatus')
const getOwnedTaskOutputRef = makeFunctionReference<
  'query',
  { taskId: string },
  null | { result?: string; status?: 'cancelled' | 'completed' | 'failed' | 'pending' | 'running' | 'timed_out' }
>('tasks:getOwnedTaskStatus')
const syncOwnedRef = makeFunctionReference<
  'mutation',
  {
    sessionId: Id<'session'>
    todos: {
      content: string
      id?: string
      position: number
      priority: 'high' | 'low' | 'medium'
      status: 'cancelled' | 'completed' | 'in_progress' | 'pending'
    }[]
  },
  { updated: number }
>('todos:syncOwned')
const listOwnedByThreadRef = makeFunctionReference<'query', { threadId: string }, unknown[] | { todos: unknown[] }>(
  'todos:listTodos'
)
const mcpDiscoverRef = makeFunctionReference<
  'mutation',
  { sessionId: Id<'session'> },
  { tools: { serverName: string; toolName: string }[] }
>('mcp:mcpDiscover')
const mcpCallToolRef = makeFunctionReference<
  'mutation',
  { serverName: string; sessionId: Id<'session'>; toolArgs: string; toolName: string },
  { content: string; ok: boolean }
>('mcp:mcpCallTool')
const groundWithGeminiRef = makeFunctionReference<
  'action',
  { query: string; threadId: string },
  { sources: { snippet: string; title: string; url: string }[]; summary: string }
>('webSearch:groundWithGemini')
const todoPrioritySchema = z.union([z.literal('high'), z.literal('medium'), z.literal('low')])
const todoStatusSchema = z.union([
  z.literal('pending'),
  z.literal('in_progress'),
  z.literal('completed'),
  z.literal('cancelled')
])
const addOptionIfMissing = ({ options, value }: { options: string[]; value: string }) => {
  if (value.length === 0 || options.includes(value)) return
  options.push(value)
}
const extractAvailableOptions = ({ message }: { message: string }) => {
  const options: string[] = []
  const regexes = [/Available\s*[:=]\s*(?<options>[^\n]+)/giu, /valid\s+options\s*[:=]\s*(?<options>[^\n]+)/giu]
  for (const regex of regexes) {
    let match = regex.exec(message)
    while (match) {
      const segment = match.groups?.options
      if (segment) {
        const parts = segment.split(',')
        for (const part of parts) {
          const value = part.trim()
          addOptionIfMissing({ options, value })
        }
      }
      match = regex.exec(message)
    }
  }
  return options
}
const detectDelegateError = ({ errorMessage }: { errorMessage: string }) => {
  const msg = errorMessage.toLowerCase()
  if (msg.includes('run_in_background')) return 'missing_run_in_background' as const
  if (msg.includes('load_skills')) return 'missing_load_skills' as const
  if (msg.includes('unknown category') || msg.includes('invalid category')) return 'unknown_category' as const
  if (msg.includes('unknown agent') || msg.includes('invalid agent')) return 'unknown_agent' as const
  return 'unknown_error' as const
}
const buildRetryGuidance = ({
  errorMessage,
  pattern
}: {
  errorMessage: string
  pattern: 'missing_load_skills' | 'missing_run_in_background' | 'unknown_agent' | 'unknown_category' | 'unknown_error'
}) => {
  const availableOptions = extractAvailableOptions({ message: errorMessage })
  let fixHint = 'Retry delegate with corrected arguments and valid values.'
  if (pattern === 'missing_run_in_background') fixHint = 'Add run_in_background parameter.'
  else if (pattern === 'missing_load_skills') fixHint = 'Add load_skills=[] parameter.'
  else if (pattern === 'unknown_category') fixHint = 'Use a valid category from the Available list.'
  else if (pattern === 'unknown_agent') fixHint = 'Use a valid agent from the Available list.'
  return {
    availableOptions,
    error: errorMessage,
    fixHint,
    ok: false as const,
    pattern,
    retryGuidance: `Delegate call failed (${pattern}). ${fixHint}`
  }
}
const createTools = ({
  ctx,
  parentThreadId,
  sessionId
}: {
  ctx: ActionCtx
  parentThreadId: string
  sessionId: Id<'session'>
}) => {
  const delegateTool = tool({
    description: 'Spawn a background task.',
    execute: async ({
      description,
      isBackground,
      prompt
    }: {
      description: string
      isBackground: boolean
      prompt: string
    }) => {
      try {
        const out = await ctx.runMutation(spawnTaskRef, {
          description,
          isBackground,
          parentThreadId,
          prompt,
          sessionId
        })
        return { status: 'pending' as const, taskId: String(out.taskId), threadId: out.threadId }
      } catch (error) {
        const errorMessage = String(error)
        const pattern = detectDelegateError({ errorMessage })
        return buildRetryGuidance({ errorMessage, pattern })
      }
    },
    inputSchema: z.object({
      description: z.string(),
      isBackground: z.boolean().default(true),
      prompt: z.string()
    })
  })
  const taskStatusTool = tool({
    description: 'Read task status and description.',
    execute: async ({ taskId }: { taskId: string }) => {
      const row = await ctx.runQuery(getOwnedTaskStatusInternalRef, { taskId })
      if (!row) return { description: null, status: null }
      return { description: row.description, status: row.status }
    },
    inputSchema: z.object({ taskId: z.string() })
  })
  const taskOutputTool = tool({
    description: 'Read task output result.',
    execute: async ({ taskId }: { taskId: string }) => {
      const row = await ctx.runQuery(getOwnedTaskOutputRef, { taskId })
      if (!row) return { result: null, status: null }
      return { result: row.result ?? null, status: row.status ?? null }
    },
    inputSchema: z.object({ taskId: z.string() })
  })
  const todoWriteTool = tool({
    description: 'Upsert todos for current session.',
    execute: async ({
      todos
    }: {
      todos: {
        content: string
        id?: string
        position: number
        priority: 'high' | 'low' | 'medium'
        status: 'cancelled' | 'completed' | 'in_progress' | 'pending'
      }[]
    }) =>
      ctx.runMutation(syncOwnedRef, {
        sessionId,
        todos
      }),
    inputSchema: z.object({
      todos: z.array(
        z.object({
          content: z.string(),
          id: z.string().optional(),
          position: z.number(),
          priority: todoPrioritySchema,
          status: todoStatusSchema
        })
      )
    })
  })
  const todoReadTool = tool({
    description: 'Read todos for current parent thread.',
    execute: async () => {
      const rows = await ctx.runQuery(listOwnedByThreadRef, { threadId: parentThreadId })
      if (Array.isArray(rows)) return { todos: rows }
      return rows
    },
    inputSchema: z.object({})
  })
  const webSearchTool = tool({
    description: 'Search the web and return summary plus sources.',
    execute: async ({ query }: { query: string }) =>
      ctx.runAction(groundWithGeminiRef, {
        query,
        threadId: parentThreadId
      }),
    inputSchema: z.object({ query: z.string() })
  })
  const mcpDiscoverTool = tool({
    description: 'Discover cached MCP tools on enabled servers.',
    execute: async () => ctx.runMutation(mcpDiscoverRef, { sessionId }),
    inputSchema: z.object({})
  })
  const mcpCallTool = tool({
    description: 'Call a cached MCP tool by server and tool name.',
    execute: async ({ serverName, toolArgs, toolName }: { serverName: string; toolArgs: string; toolName: string }) =>
      ctx.runMutation(mcpCallToolRef, {
        serverName,
        sessionId,
        toolArgs,
        toolName
      }),
    inputSchema: z.object({
      serverName: z.string(),
      toolArgs: z.string().default('{}'),
      toolName: z.string()
    })
  })
  return {
    delegateTool,
    mcpCallTool,
    mcpDiscoverTool,
    taskOutputTool,
    taskStatusTool,
    todoReadTool,
    todoWriteTool,
    webSearchTool
  }
}
const createOrchestratorTools = ({
  ctx,
  parentThreadId,
  sessionId
}: {
  ctx: ActionCtx
  parentThreadId: string
  sessionId: Id<'session'>
}): ToolSet => {
  const tools = createTools({ ctx, parentThreadId, sessionId })
  return {
    delegate: tools.delegateTool,
    mcpCall: tools.mcpCallTool,
    mcpDiscover: tools.mcpDiscoverTool,
    taskOutput: tools.taskOutputTool,
    taskStatus: tools.taskStatusTool,
    todoRead: tools.todoReadTool,
    todoWrite: tools.todoWriteTool,
    webSearch: tools.webSearchTool
  }
}
const createWorkerTools = ({
  ctx,
  parentThreadId,
  sessionId
}: {
  ctx: ActionCtx
  parentThreadId: string
  sessionId: Id<'session'>
}): ToolSet => {
  const tools = createTools({ ctx, parentThreadId, sessionId })
  return {
    webSearch: tools.webSearchTool
  }
}
export { buildRetryGuidance, createOrchestratorTools, createWorkerTools, detectDelegateError }
