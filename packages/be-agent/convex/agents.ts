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
  >('tasks:spawnTask'),
  getOwnedTaskStatusInternalRef = makeFunctionReference<
    'query',
    { taskId: string },
    null | { description: string; status: 'cancelled' | 'completed' | 'failed' | 'pending' | 'running' | 'timed_out' }
  >('tasks:getOwnedTaskStatusInternal'),
  getOwnedTaskOutputRef = makeFunctionReference<
    'query',
    { taskId: string },
    null | { result?: string; status?: 'cancelled' | 'completed' | 'failed' | 'pending' | 'running' | 'timed_out' }
  >('tasks:getOwnedTaskOutput'),
  syncOwnedRef = makeFunctionReference<
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
  >('todos:syncOwned'),
  listOwnedByThreadRef = makeFunctionReference<'query', { threadId: string }, unknown[] | { todos: unknown[] }>(
    'todos:listOwnedByThread'
  ),
  mcpDiscoverRef = makeFunctionReference<
    'mutation',
    { sessionId: Id<'session'> },
    { tools: { serverName: string; toolName: string }[] }
  >('mcp:mcpDiscover'),
  mcpCallToolRef = makeFunctionReference<
    'mutation',
    { serverName: string; sessionId: Id<'session'>; toolArgs: string; toolName: string },
    { content: string; ok: boolean }
  >('mcp:mcpCallTool'),
  groundWithGeminiRef = makeFunctionReference<
    'action',
    { query: string; threadId: string },
    { sources: { snippet: string; title: string; url: string }[]; summary: string }
  >('webSearch:groundWithGemini'),
  todoPrioritySchema = z.union([z.literal('high'), z.literal('medium'), z.literal('low')]),
  todoStatusSchema = z.union([
    z.literal('pending'),
    z.literal('in_progress'),
    z.literal('completed'),
    z.literal('cancelled')
  ]),
  createTools = ({
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
          const out = await ctx.runMutation(spawnTaskRef, {
            description,
            isBackground,
            parentThreadId,
            prompt,
            sessionId
          })
          return { status: 'pending' as const, taskId: String(out.taskId), threadId: out.threadId }
        },
        inputSchema: z.object({
          description: z.string(),
          isBackground: z.boolean().default(true),
          prompt: z.string()
        })
      }),
      taskStatusTool = tool({
        description: 'Read task status and description.',
        execute: async ({ taskId }: { taskId: string }) => {
          const row = await ctx.runQuery(getOwnedTaskStatusInternalRef, { taskId })
          if (!row) return { description: null, status: null }
          return { description: row.description, status: row.status }
        },
        inputSchema: z.object({ taskId: z.string() })
      }),
      taskOutputTool = tool({
        description: 'Read task output result.',
        execute: async ({ taskId }: { taskId: string }) => {
          const row = await ctx.runQuery(getOwnedTaskOutputRef, { taskId })
          if (!row) return { result: null, status: null }
          return { result: row.result ?? null, status: row.status ?? null }
        },
        inputSchema: z.object({ taskId: z.string() })
      }),
      todoWriteTool = tool({
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
      }),
      todoReadTool = tool({
        description: 'Read todos for current parent thread.',
        execute: async () => {
          const rows = await ctx.runQuery(listOwnedByThreadRef, { threadId: parentThreadId })
          if (Array.isArray(rows)) return { todos: rows }
          return rows
        },
        inputSchema: z.object({})
      }),
      webSearchTool = tool({
        description: 'Search the web and return summary plus sources.',
        execute: async ({ query }: { query: string }) =>
          ctx.runAction(groundWithGeminiRef, {
            query,
            threadId: parentThreadId
          }),
        inputSchema: z.object({ query: z.string() })
      }),
      mcpDiscoverTool = tool({
        description: 'Discover cached MCP tools on enabled servers.',
        execute: async () => ctx.runMutation(mcpDiscoverRef, { sessionId }),
        inputSchema: z.object({})
      }),
      mcpCallTool = tool({
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
  },
  createOrchestratorTools = ({
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
  },
  createWorkerTools = ({
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

export { createOrchestratorTools, createWorkerTools }
