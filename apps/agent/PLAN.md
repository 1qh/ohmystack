# Agent Harness — Implementation Plan

## Verbatim Requirements

### User Request

> Now, i want to make a simplified version of you, oh-my-openagent (latest version) but for the web, built on noboil convex. Think of it like an agent harness, but built on the web technologies and for the web infrastructure.
>
> This is a complex app to push the boundary of both convex and our library to maximum. Let's leverage all the best of both worlds: Our noboil/convex setup and convex itself.
>
> After this app is done and verified working, we will try to make our building blocks to be generic and release @noboil/agent as a solution for anyone to build their own web-based agent harness with maximum customizability.
>
> First, clone the repo and pinpoint the exact commit hash, this is to know the exact version of our reference, so when they have newer releases, we can compare and see their improvements to adopt what we can.
>
> Let create a new app inside apps/ called 'agent', this is where this new app lives.

### Capabilities Requested

- Parallel sync/async/background tasks
- Search capability based on Gemini grounding search
- MCP
- Multiple agents delegation
- To-do list
- System reminder for continuation on unfinished to-do list
- Poll on a background task to see its progress
- System reminder for done background tasks
- See clear reasoning, response, tool calls on frontend
- Non-blocking conversation when tasks are being executed
- Token usage tracking
- Compaction

### Explicitly Excluded

- Undo a message
- Fork conversation
- Switch models
- Switch main orchestrator
- Plan mode / plan executor mode
- Switch reasoning effort of a model
- Slash commands
- Editing files
- Code execution
- Any command-line related tools

### Clarifications

- **Auth**: Simple user auth, but structured to be org-auth-ready
- **Multi-user**: Yes, multiple users can use the system
- **MCP server management**: Both UI configuration and admin backend configuration
- **Deployment**: Inside this monorepo at `apps/agent`
- **LLM**: Start with Gemini 2.5 Flash via AI SDK v6
- **One orchestrator**: User does not configure anything, we provide defaults
- **Tools**: Convex actions/mutations (sync/async/background) with system reminder injection
- **Streaming**: Everything streamable to frontend, same as OpenCode. Each agent's stream visible in UI
- **Borrowed code**: Track source file paths from oh-my-openagent for future upstream adoption

---

## Reference

**oh-my-openagent**: `code-yeongyu/oh-my-openagent`
- **Commit**: `6625670` (dev branch, 2026-03-13)
- **Installed version**: v1.2.24
- **Latest release**: v3.11.2

**@convex-dev/agent**: `get-convex/agent`
- **Commit**: `6fbf088`
- **Requires**: AI SDK v6 (`ai@^6.0.35`, `@ai-sdk/openai@^3.0.10`)

---

## Convex Topology

### Final Decision

Use a **separate Convex project** for the agent harness:

- Frontend app remains at `apps/agent/`
- Backend Convex project is isolated at `packages/be-agent/`
- Agent frontend uses a different `NEXT_PUBLIC_CONVEX_URL` than existing demo apps
- Agent backend has its own schema, auth boundaries, environment variables, cron jobs, and deployment lifecycle

### Rationale

1. `@convex-dev/agent` requires component registration in `convex.config.ts`; isolating this avoids polluting demo app Convex projects.
2. Agent domain tables are unrelated to demo entities (`blog`, `chat`, `movie`, `org`) and should not cohabitate one deployment.
3. Agent workload profile differs: MCP connections, long-running actions, continuation loops, compaction pipelines.
4. Convex supports multiple projects cleanly inside a single monorepo.

### Boundary Rule

- `packages/be-convex/` remains the demo backend package.
- `packages/be-agent/` is an independent backend package with independent `convex dev` and `convex deploy` targets.

---

## Architecture

### Three Layers

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Frontend (apps/agent, Next.js 16 + React 19)                           │
│ ┌───────────────────────────┬───────────────────────┬────────────────┐ │
│ │ Chat Panel                │ Side Rail             │ Source Rail    │ │
│ │ - streaming text          │ - tasks               │ - grounding    │ │
│ │ - reasoning blocks        │ - todos               │   sources      │ │
│ │ - tool call cards         │ - token usage         │ - mcp outputs  │ │
│ └───────────────┬───────────┴──────────────┬────────┴────────┬──────┘ │
│                 │ reactive Convex queries   │                 │         │
├─────────────────┼───────────────────────────┼─────────────────┼─────────┤
│ Agent Backend (packages/be-agent Convex project)                        │
│ ┌───────────────┴──────────────────────────────────────────────────────┐ │
│ │ Orchestrator Action                                                   │ │
│ │ - queue-aware run coordinator                                         │ │
│ │ - streamText with step cap                                            │ │
│ │ - function tool execution only                                        │ │
│ │ - post-turn todo continuation audit                                   │ │
│ └──────────────┬─────────────────────────┬─────────────────────────────┘ │
│                │                         │                               │
│      ┌─────────┴────────┐      ┌─────────┴────────────┐                  │
│      │ Worker Actions    │      │ MCP + Search Actions │                  │
│      │ - delegated tasks │      │ - webSearch bridge   │                  │
│      │ - completion mut. │      │ - mcpCall/discover   │                  │
│      └─────────┬────────┘      └─────────┬────────────┘                  │
│                │                         │                               │
├────────────────┼─────────────────────────┼───────────────────────────────┤
│ Tables                                                                    │
│ session | tasks | todos | mcpServers | tokenUsage | threadRunState | @convex-dev/agent │
└────────────────────────────────────────────────────────────────────────────┘
```

### Cross-Cutting Concerns

1. **Ownership and authorization**
   - Every public query and mutation first resolves the current authenticated user.
   - Every access to `sessionId`, `threadId`, `taskId`, or `mcpServer` must verify ownership by current user.
   - Any `threadId` or `taskId` lookup must map through an owned session before returning data.
2. **Thread-safe orchestration**
   - v1 policy: queue one orchestrator run per thread.
   - New user message is saved immediately; run starts when current run ends.
3. **Idempotent state transitions**
   - task lifecycle writes are mutation-first, with retry-safe fields.
4. **No provider-tool mixing in orchestration calls**
   - orchestrator and worker calls use only function tools.

### Primary Data Flow

```
User message submitted
  -> mutation sessions.submitMessage
       - atomically saves user message and enqueues orchestrator run (`reason='user_message'`)
        - CAS threadRunState by_threadId
         - if idle: generate runToken, set active + runClaimed=false, clear queue, autoContinueStreak=0, schedule run
         - if active: set queuedPromptMessageId (only if incoming priority > queued priority)

agents.runOrchestrator action
  -> mutation orchestrator.claimRun(threadId, runToken)
       - CAS: activeRunToken === runToken AND runClaimed !== true
       - set runClaimed=true atomically (consuming claim — duplicate deliveries fail)
       - abort early if claim fails
  -> pre-generation compaction check on closed prefix
  -> streamText with function tools only, maxSteps=25
  -> await consumeStream
  -> post-turn audit:
        - read todos + active tasks (`running` and `pending`)
        - if incomplete todos and no active background work and no user-input request
          (v1 heuristic: always false; v2 infers from model output)
          and autoContinueStreak < 5
          then save reminder + enqueue one continuation
  -> mutation orchestrator.finishRun
        - if queuedPromptMessageId exists: keep active + schedule next queued run
        - else: clear activeRunToken and set idle
```

### Background Delegation Flow

```
delegate tool execute
  -> mutation tasks.spawnTask
       - create worker thread
       - insert task row
       - schedule worker action
       - return taskId/threadId atomically

runWorker action
  -> mutation tasks.markRunning
  -> streamText with function tools only, maxSteps=10
  -> heartbeat mutation updates while running
  -> on success mutation tasks.completeTask
        - CAS status running -> completed
        - completedAt set
        - reminder inserted into parent thread as system message and stored as completionReminderMessageId
        - completionNotifiedAt set in same mutation boundary
        - enqueue continuation with promptMessageId=completionReminderMessageId
        - only continue orchestrator if completion reminder is latest message
        - increment auto-continue streak inside enqueue mutation for task-completion continuation path (atomic cap)
  -> on failure mutation tasks.failTask
```

```typescript
const heartbeatInterval = setInterval(async () => {
  await ctx.runMutation(internal.tasks.updateHeartbeat, { taskId })
}, 30_000)
try {
  await result.consumeStream()
} finally {
  clearInterval(heartbeatInterval)
}
```

---

## Convex Schema

All schema and table design follows patterns from `packages/be-convex/t.ts`, `packages/be-convex/convex/schema.ts`, and `packages/be-convex/lazy.ts`.

### Backend Types (`packages/be-agent/t.ts`)

```typescript
import { makeOwned } from '@noboil/convex/schema'
import { number, object, string, enum as zenum } from 'zod/v4'

const owned = makeOwned({
  session: object({
    archivedAt: number().optional(),
    lastActivityAt: number(),
    status: zenum(['active', 'idle', 'archived']),
    threadId: string(),
    title: string()
  })
})

export { owned }
```

### Convex Tables (`packages/be-agent/convex/schema.ts`)

```typescript
import { authTables } from '@convex-dev/auth/server'
import { ownedTable } from '@noboil/convex/server'
import { rateLimitTables } from 'convex-helpers/server/rateLimit'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { owned } from '../t'

export default defineSchema({
  ...authTables,
  ...rateLimitTables,
  session: ownedTable(owned.session)
    .index('by_user_status', ['userId', 'status'])
    .index('by_user_threadId', ['userId', 'threadId'])
    .index('by_threadId', ['threadId'])
    .index('by_status', ['status']),
  tasks: defineTable({
    agent: v.string(),
    completedAt: v.optional(v.number()),
    completionReminderMessageId: v.optional(v.string()),
    completionNotifiedAt: v.optional(v.number()),
    continuationEnqueuedAt: v.optional(v.number()),
    description: v.string(),
    heartbeatAt: v.optional(v.number()),
    isBackground: v.boolean(),
    lastError: v.optional(v.string()),
    parentThreadId: v.string(),
    pendingAt: v.optional(v.number()),
    prompt: v.string(),
    result: v.optional(v.string()),
    retryCount: v.number(),
    sessionId: v.id('session'),
    startedAt: v.optional(v.number()),
    status: v.union(
      v.literal('pending'),
      v.literal('running'),
      v.literal('completed'),
      v.literal('error'),
      v.literal('timed_out'),
      v.literal('cancelled')
    ),
    threadId: v.string(),
    userId: v.string()
  })
    .index('by_session', ['sessionId'])
    .index('by_parentThreadId', ['parentThreadId'])
    .index('by_parentThreadId_status', ['parentThreadId', 'status'])
    .index('by_completionReminderMessageId', ['completionReminderMessageId'])
    .index('by_status', ['status'])
    .index('by_threadId', ['threadId'])
    .index('by_user_status', ['userId', 'status']),
  todos: defineTable({
    content: v.string(),
    position: v.number(),
    priority: v.union(v.literal('high'), v.literal('medium'), v.literal('low')),
    sessionId: v.id('session'),
    status: v.union(
      v.literal('pending'),
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('cancelled')
    ),
    userId: v.string()
  })
    .index('by_session', ['sessionId'])
    .index('by_session_position', ['sessionId', 'position']),
  mcpServers: defineTable({
    authHeaders: v.optional(v.string()),
    cachedAt: v.optional(v.number()),
    cachedTools: v.optional(
      v.array(
        v.object({
          description: v.string(),
          inputSchema: v.string(),
          name: v.string()
        })
      )
    ),
    isEnabled: v.boolean(),
    name: v.string(),
    transport: v.literal('http'),
    url: v.string(),
    userId: v.string()
  })
    .index('by_user', ['userId'])
    .index('by_user_name', ['userId', 'name'])
    .index('by_user_enabled', ['userId', 'isEnabled']),
  tokenUsage: defineTable({
    agentName: v.optional(v.string()),
    inputTokens: v.number(),
    model: v.string(),
    outputTokens: v.number(),
    provider: v.string(),
    sessionId: v.id('session'),
    threadId: v.string(),
    totalTokens: v.number(),
    userId: v.string()
  })
    .index('by_session', ['sessionId'])
    .index('by_threadId', ['threadId']),
  threadRunState: defineTable({
    activeRunToken: v.optional(v.string()),
    activatedAt: v.optional(v.number()),
    autoContinueStreak: v.number(),
    compactionLock: v.optional(v.string()),
    compactionLockAt: v.optional(v.number()),
    compactionSummary: v.optional(v.string()),
    lastCompactedMessageId: v.optional(v.string()),
    lastError: v.optional(v.string()),
    queuedPriority: v.optional(v.union(v.literal('user_message'), v.literal('task_completion'), v.literal('todo_continuation'))),
    queuedPromptMessageId: v.optional(v.string()),
    queuedReason: v.optional(v.union(v.literal('user_message'), v.literal('task_completion'), v.literal('todo_continuation'))),
    runClaimed: v.optional(v.boolean()),
    claimedAt: v.optional(v.number()),
    runHeartbeatAt: v.optional(v.number()),
    status: v.union(v.literal('idle'), v.literal('active')),
    threadId: v.string()
  })
    .index('by_threadId', ['threadId'])
    .index('by_status', ['status'])
})
```

### Notes

- `session.tokenUsage` is removed by design; session totals are derived from `tokenUsage` rows.
- `mcpServers.cachedTools[].inputSchema` and `toolArgs` are `v.string()` JSON payloads.
- `tasks.heartbeatAt` is the single heartbeat source; `lastHeartbeatAt` is intentionally not modeled.
- All user-facing reads enforce user ownership before data return.

---

## Lazy Factory Setup

Pattern matches `packages/be-convex/lazy.ts`.

```typescript
import { setup } from '@noboil/convex/server'

import { action, internalMutation, internalQuery, mutation, query } from './convex/_generated/server'
import { getAuthUserIdOrTest } from './convex/testauth'

const s = setup({
    action,
    getAuthUserId: getAuthUserIdOrTest,
    internalMutation,
    internalQuery,
    mutation,
    query
  }),
  { crud, m, q } = s

export { crud, m, q }
```

---

## Model Selection Pattern

Gemini 2.5 Flash stays fixed for v1 while still supporting deterministic test mode.

```typescript
import type { LanguageModel } from 'ai'

import './env'
import { mockModel } from './models.mock'

const isTestEnvironment =
  typeof process !== 'undefined' &&
  Boolean(process.env.PLAYWRIGHT || process.env.TEST_MODE || process.env.CONVEX_TEST_MODE)

let cached: LanguageModel | undefined
const getModel = async (): Promise<LanguageModel> => {
  if (cached) return cached
  if (isTestEnvironment) {
    cached = mockModel
    return cached
  }
  const { google } = await import('@ai-sdk/google')
  cached = google('gemini-2.5-flash') as LanguageModel
  return cached
}

export { getModel }
```

`import './env'` ensures the `@t3-oss/env-core` validation runs when the module is first loaded. Since `ai.ts` is imported by agent definitions (`agents.ts`), validation is guaranteed to execute before any model access. The `skipValidation` flag in `env.ts` short-circuits validation in CI, lint, and test environments.

---

## Agent Definitions

`components.agent` is imported from Convex generated API:

```typescript
import { components } from './convex/_generated/api'
```

### Orchestrator (Sisyphus-Web)

```typescript
import { Agent } from '@convex-dev/agent'

const orchestrator = new Agent(components.agent, {
  callSettings: {
    temperature: 0.7
  },
  contextOptions: {
    excludeToolMessages: false,
    recentMessages: 100
  },
  instructions: ORCHESTRATOR_SYSTEM_PROMPT,
  languageModel: getModel,
  maxSteps: 25,
  name: 'Orchestrator',
  tools: {
    delegate: delegateTool,
    mcpCall: mcpCallTool,
    mcpDiscover: mcpDiscoverTool,
    taskOutput: taskOutputTool,
    taskStatus: taskStatusTool,
    todoRead: todoReadTool,
    todoWrite: todoWriteTool,
    webSearch: webSearchTool
  },
  usageHandler: usageHandlerByThread
})
```

### Worker

```typescript
const worker = new Agent(components.agent, {
  callSettings: {
    temperature: 0.5
  },
  contextOptions: { recentMessages: 50 },
  instructions: WORKER_SYSTEM_PROMPT,
  languageModel: getModel,
  maxSteps: 10,
  name: 'Worker',
  tools: {
    mcpCall: mcpCallTool,
    mcpDiscover: mcpDiscoverTool,
    webSearch: webSearchTool
  },
  usageHandler: usageHandlerByThread
})
```

### Usage Handler and Canonical Token Recording

Note: `@convex-dev/agent`'s `UsageHandler` passes `usage: LanguageModelUsage` using `inputTokens`/`outputTokens`/`totalTokens` from AI SDK v6.

```typescript
const usageHandlerByThread = async (ctx, { userId, threadId, agentName, usage, providerMetadata, model, provider }) => {
  await ctx.runMutation(internal.tokenUsage.recordModelUsage, {
    agentName: agentName ?? 'unknown',
    outputTokens: usage.outputTokens,
    model,
    inputTokens: usage.inputTokens,
    provider,
    threadId,
    totalTokens: usage.totalTokens
  })
}

const recordModelUsage = internalMutation({
  args: {
    agentName: v.optional(v.string()),
    outputTokens: v.number(),
    model: v.string(),
    inputTokens: v.number(),
    provider: v.string(),
    threadId: v.string(),
    totalTokens: v.number()
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('session')
      .withIndex('by_threadId', q => q.eq('threadId', args.threadId))
      .first()
    if (session) {
      await ctx.db.insert('tokenUsage', {
        agentName: args.agentName,
        outputTokens: args.outputTokens,
        model: args.model,
        inputTokens: args.inputTokens,
        provider: args.provider,
        sessionId: session._id,
        threadId: args.threadId,
        totalTokens: args.totalTokens,
        userId: session.userId
      })
      return
    }

    const task = await ctx.db
      .query('tasks')
      .withIndex('by_threadId', q => q.eq('threadId', args.threadId))
      .first()
    if (!task) return
    const ownerSession = await ctx.db.get(task.sessionId)
    if (!ownerSession) return

    await ctx.db.insert('tokenUsage', {
      agentName: args.agentName,
      outputTokens: args.outputTokens,
      model: args.model,
      inputTokens: args.inputTokens,
      provider: args.provider,
      sessionId: ownerSession._id,
      threadId: args.threadId,
      totalTokens: args.totalTokens,
      userId: ownerSession.userId
    })
  }
})
```

## System Prompts

### System Prompts (`packages/be-agent/prompts.ts`)

```typescript
const ORCHESTRATOR_SYSTEM_PROMPT = [
  'You are a web-based AI assistant with background task and tool capabilities.',
  '',
  'Available tools:',
  '- delegate: Spawn background tasks for independent work. Use for research, analysis, or any work that can run in parallel.',
  '- webSearch: Search the web for current information. Returns summary and source URLs.',
  '- todoWrite: Track multi-step work. Mark in_progress before starting, completed after finishing. Only one task in_progress at a time.',
  '- taskStatus: Check the status of a background task by ID.',
  '- taskOutput: Retrieve the full result of a completed background task.',
  '- mcpCall: Call a tool on a configured MCP server.',
  '- mcpDiscover: List available tools from configured MCP servers.',
  '',
  'When system reminders arrive about completed tasks, use taskOutput to retrieve results.',
  'Be direct and concise. No preamble or filler.',
  'You cannot access files, execute code, or run CLI commands.'
].join('\n')

const WORKER_SYSTEM_PROMPT = [
  'You are a focused worker agent handling a delegated task.',
  'Complete the specific task described in your prompt. Do not deviate.',
  'Use webSearch for research if needed. Use mcpCall/mcpDiscover for MCP tools if relevant.',
  'Provide a clear, concise result with relevant data and findings.',
  'You cannot delegate further or manage todos.'
].join('\n')

export { ORCHESTRATOR_SYSTEM_PROMPT, WORKER_SYSTEM_PROMPT }
```

---

## Tool Definitions

`createTool` from `@convex-dev/agent` uses `inputSchema` (Zod schema) and `execute: async (ctx, input, options)` following the AI SDK tool pattern. The deprecated `args`/`handler` (Convex mutation style) was removed in v0.6.0 and type-errors if used. The `execute` function receives the Convex action context as its first argument (unlike plain AI SDK tools). Snippets may omit `options` when unused.

### 1. `delegate`

Mutation-first spawn with atomic insert plus schedule.

```typescript
import { createTool } from '@convex-dev/agent'
import { z } from 'zod/v4'

const delegateTool = createTool({
  description:
    'Delegate a task to a worker agent. Returns taskId and worker threadId. The worker runs asynchronously.',
  execute: async (ctx, input) => {
    try {
      const spawn = await ctx.runMutation(internal.tasks.spawnTask, {
        description: input.description,
        isBackground: input.isBackground,
        parentThreadId: ctx.threadId,
        prompt: input.prompt,
        userId: ctx.userId
      })
      return {
        status: 'pending',
        taskId: spawn.taskId,
        threadId: spawn.threadId
      }
    } catch (error) {
      return { code: 'spawn_failed', error: String(error), ok: false }
    }
  },
  inputSchema: z.object({
    description: z.string(),
    isBackground: z.boolean().default(true),
    prompt: z.string()
  })
})
```

### 2. `todoWrite`

Stable ordering uses `position`.

```typescript
const todoWriteTool = createTool({
  description: 'Create or update todo list for the current session.',
  execute: async (ctx, { todos }) => {
    try {
      await ctx.runMutation(internal.todos.syncOwned, { sessionThreadId: ctx.threadId, todos })
      return { updated: todos.length }
    } catch (error) {
      return { code: 'sync_failed', error: String(error), ok: false }
    }
  },
  inputSchema: z.object({
    todos: z.array(
      z.object({
        content: z.string(),
        position: z.number(),
        priority: z.enum(['high', 'medium', 'low']),
        status: z.enum(['pending', 'in_progress', 'completed', 'cancelled'])
      })
    )
  })
})
```

### 3. `todoRead`

```typescript
const todoReadTool = createTool({
  description: 'Read todo list for current session.',
  execute: async (ctx) => {
    try {
      const todos = await ctx.runQuery(internal.todos.listOwnedByThread, { threadId: ctx.threadId })
      return { todos }
    } catch (error) {
      return { code: 'read_failed', error: String(error), ok: false }
    }
  },
  inputSchema: z.object({})
})
```

### 4. `taskStatus`

```typescript
const taskStatusTool = createTool({
  description: 'Check progress for a background task.',
  execute: async (ctx, { taskId }) => {
    try {
      return await ctx.runQuery(internal.tasks.getOwnedTaskStatusInternal, {
        requesterThreadId: ctx.threadId,
        taskId
      })
    } catch (error) {
      return { code: 'status_failed', error: String(error), ok: false }
    }
  },
  inputSchema: z.object({ taskId: z.string() })
})
```

### 5. `taskOutput`

```typescript
const taskOutputTool = createTool({
  description: 'Get output for a completed background task.',
  execute: async (ctx, { taskId }) => {
    try {
      return await ctx.runQuery(internal.tasks.getOwnedTaskOutput, {
        requesterThreadId: ctx.threadId,
        taskId
      })
    } catch (error) {
      return { code: 'output_failed', error: String(error), ok: false }
    }
  },
  inputSchema: z.object({ taskId: z.string() })
})
```

### 6. `webSearch`

Function tool wrapper that delegates provider tool usage to a dedicated action call.

```typescript
const webSearchTool = createTool({
  description: 'Run grounded web search and return summary with sources.',
  execute: async (ctx, { query }) => {
    try {
      const result = await ctx.runAction(internal.search.groundWithGemini, {
        query,
        threadId: ctx.threadId
      })
      return { sources: result.sources, summary: result.summary }
    } catch (error) {
      return { code: 'search_failed', error: String(error), ok: false }
    }
  },
  inputSchema: z.object({ query: z.string() })
})
```

### 7. `mcpCall`

```typescript
const mcpCallTool = createTool({
  description: 'Call a configured MCP tool.',
  execute: async (ctx, { serverName, toolArgs, toolName }) => {
    try {
      return await ctx.runAction(internal.mcp.callToolOwned, {
        requesterThreadId: ctx.threadId,
        serverName,
        toolArgs,
        toolName
      })
    } catch (error) {
      return { code: 'mcp_call_failed', error: String(error), ok: false }
    }
  },
  inputSchema: z.object({
    serverName: z.string(),
    toolArgs: z.string(),
    toolName: z.string()
  })
})
```

### 8. `mcpDiscover`

```typescript
const mcpDiscoverTool = createTool({
  description: 'List available MCP tools from enabled servers for the current user.',
  execute: async (ctx) => {
    try {
      return await ctx.runAction(internal.mcp.discoverToolsOwned, { requesterThreadId: ctx.threadId })
    } catch (error) {
      return { code: 'mcp_discover_failed', error: String(error), ok: false }
    }
  },
  inputSchema: z.object({})
})
```

---

## Task Lifecycle

### States

```
pending -> running -> completed
                  -> error
                  -> timed_out
                  -> cancelled
```

`error`, `timed_out`, and `cancelled` are terminal.

### Spawn Is Mutation-First

`internal.tasks.spawnTask` does all of the following in one mutation boundary:

1. Resolve owner session from parent `threadId` and current user.
2. Create worker thread.
3. Insert task row with idempotency defaults.
4. Schedule worker action immediately.

From mutation context, `worker.createThread(ctx, ...)` returns only `{ threadId }`.

```typescript
const spawnTask = internalMutation({
  args: {
    description: v.string(),
    isBackground: v.boolean(),
    parentThreadId: v.string(),
    prompt: v.string(),
    userId: v.string()
  },
  handler: async (ctx, args) => {
    const session = await resolveOwnedSessionByThread({
      ctx,
      threadId: args.parentThreadId,
      userId: args.userId
    })
    const { threadId } = await worker.createThread(ctx, {
      title: args.description,
      userId: session.userId
    })

    const taskId = await ctx.db.insert('tasks', {
      agent: 'Worker',
      description: args.description,
      isBackground: args.isBackground,
      parentThreadId: args.parentThreadId,
      pendingAt: Date.now(),
      prompt: args.prompt,
      retryCount: 0,
      sessionId: session._id,
      status: 'pending',
      threadId,
      userId: session.userId
    })
    await ctx.scheduler.runAfter(0, internal.agents.runWorker, {
      prompt: args.prompt,
      taskId,
      threadId
    })
    return { taskId, threadId }
  }
})
```

### CAS Transitions and Idempotency

All lifecycle mutations are compare-and-set and return no-op when preconditions fail.

```typescript
const markRunning = internalMutation({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId)
    if (!task || task.status !== 'pending') return { ok: false }
    const session = await ctx.db.get(task.sessionId)
    if (session?.status === 'archived') {
      await ctx.db.patch(taskId, { lastError: 'session_archived', status: 'cancelled' })
      return { ok: false }
    }
    await ctx.db.patch(taskId, { heartbeatAt: Date.now(), startedAt: Date.now(), status: 'running' })
    return { ok: true }
  }
})

const updateHeartbeat = internalMutation({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId)
    if (!task || task.status !== 'running') return
    await ctx.db.patch(taskId, { heartbeatAt: Date.now() })
  }
})

const completeTask = internalMutation({
  args: { result: v.string(), taskId: v.id('tasks') },
  handler: async (ctx, { result, taskId }) => {
    const task = await ctx.db.get(taskId)
    if (!task || task.status !== 'running') return { ok: false }
    if (task.completionNotifiedAt) return { ok: false }

    const reminderText = buildTaskCompletionReminder({
      description: task.description,
      result,
      taskId: String(taskId)
    })
    const saved = await orchestrator.saveMessage(ctx, {
      message: { content: reminderText, role: 'system' },
      skipEmbeddings: true,
      threadId: task.parentThreadId
    })

    await ctx.db.patch(taskId, {
      completedAt: Date.now(),
      completionNotifiedAt: Date.now(),
      completionReminderMessageId: saved.messageId,
      result,
      status: 'completed'
    })
    const session = await ctx.db
      .query('session')
      .withIndex('by_threadId', q => q.eq('threadId', task.parentThreadId))
      .first()
    if (session) await ctx.db.patch(session._id, { lastActivityAt: Date.now() })
    return { ok: true, reminderMessageId: saved.messageId }
  }
})

const failTask = internalMutation({
  args: { errorMessage: v.string(), taskId: v.id('tasks') },
  handler: async (ctx, { errorMessage, taskId }) => {
    const task = await ctx.db.get(taskId)
    if (!task || task.status !== 'running') return { ok: false }
    await ctx.db.patch(taskId, {
      lastError: errorMessage,
      retryCount: task.retryCount + 1,
      status: 'error'
    })
    const session = await ctx.db
      .query('session')
      .withIndex('by_threadId', q => q.eq('threadId', task.parentThreadId))
      .first()
    if (session) await ctx.db.patch(session._id, { lastActivityAt: Date.now() })
    return { ok: true }
  }
})
```

```typescript
const markContinuationEnqueued = internalMutation({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId)
    if (!task) return
    await ctx.db.patch(taskId, { continuationEnqueuedAt: Date.now() })
  }
})
```

### Required Idempotent Fields

- `heartbeatAt`
- `continuationEnqueuedAt`
- `runHeartbeatAt`
- `activatedAt`
- `lastCompactedMessageId`
- `completedAt`
- `completionNotifiedAt`
- `retryCount`
- `lastError`

### Completion Reminder Gating

Orchestrator auto-continue after task completion is allowed only when the completion reminder message is still the latest message in parent thread.
Reminder insertion and notification marking are unified in `completeTask` so completion side effects happen in one CAS path.
The latest-message check and enqueue are combined atomically in `enqueueRunIfLatest` to prevent user messages from racing the continuation.

```typescript
const maybeContinueOrchestrator = async ({ ctx, taskId }) => {
  const task = await ctx.runQuery(internal.tasks.getById, { taskId })
  if (!task || !task.completionReminderMessageId) return
  const session = await ctx.runQuery(internal.sessions.getByThreadIdInternal, { threadId: task.parentThreadId })
  if (session?.status === 'archived') return
  if (task.continuationEnqueuedAt) return
  const enqueued = await ctx.runMutation(internal.orchestrator.enqueueRunIfLatest, {
    expectedLatestMessageId: task.completionReminderMessageId,
    incrementStreak: true,
    promptMessageId: task.completionReminderMessageId,
    reason: 'task_completion',
    threadId: task.parentThreadId
  })
  if (!enqueued.ok) return
  await ctx.runMutation(internal.tasks.markContinuationEnqueued, { taskId })
}
```

v1 limitation: if the worker action crashes between `completeTask` and `maybeContinueOrchestrator`, the completion reminder is persisted but no continuation is enqueued. The thread remains idle with no queued payload, so `timeoutStaleRuns` cannot recover this case. The user must send a new message to re-engage the orchestrator. On the retry side, if `enqueueRun` succeeds but the action crashes before `markContinuationEnqueued`, a retry of the action would call `maybeContinueOrchestrator` again — the `continuationEnqueuedAt` guard prevents duplicate enqueue on retry, so at most one continuation is scheduled. v2 can move continuation enqueue into `completeTask` itself (mutations can use `ctx.scheduler.runAfter`) to eliminate both the crash-gap and the retry-duplicate risk.

The same crash-gap limitation applies to todo auto-continuation in `postTurnAudit`: if the action crashes between saving the system reminder and enqueuing `todo_continuation`, the reminder is persisted but no continuation is enqueued. On retry, the duplicate enqueue is prevented by `postTurnAudit` re-checking whether a `todo_continuation` is already queued (the `enqueueRun` call with `todo_continuation` reason succeeds only if no equal-or-higher-priority payload is already queued). The user must send a new message to re-engage the orchestrator if the crash-gap scenario occurs.

Delegation Idempotency: `@convex-dev/agent` handles retries at the agent-step execution layer. If the model emits duplicate delegate tool calls, separate tasks are intentionally created (the model delegated twice). Convex action retry behavior is absorbed by the agent framework's step-level deduplication.

Worker retry side-effect safety: when `runWorker` retries a failed task, any MCP tool calls that already executed external mutations before the failure will be duplicated. Additionally, the worker re-saves the prompt message on retry, which can produce duplicate prompt entries on the worker thread. Both are accepted v1 limitations — MCP tool calls are inherently non-idempotent, and the duplicate prompt is cosmetic (only visible if inspecting the worker thread directly). v2 can add tool-call-level deduplication by tracking `toolCallId` per execution attempt, and skip prompt save if already present on the thread.

---

## Agent Runtime Flow

### Stream Wrapper (Max 3 Positional Args)

All stream entry points use a local wrapper that accepts a single object arg.
`agent.streamText` from `@convex-dev/agent` takes 4 positional arguments as an external SDK API. `runAgentStream` encapsulates that call to keep application-layer code on a single-object-arg interface.

```typescript
const runAgentStream = async ({ agent, ctx, threadId, promptMessageId, systemPrefix }) => {
  const streamMessages = []
  if (systemPrefix) streamMessages.push({ content: systemPrefix, role: 'system' as const })

  return await agent.streamText(
    ctx,
    { threadId },
    {
      ...(promptMessageId ? { promptMessageId } : {}),
      ...(streamMessages.length > 0 ? { messages: streamMessages } : {})
    },
    { saveStreamDeltas: { chunking: 'word', throttleMs: 100 } }
  )
}
```

### Save Message and Prompt Chaining

System reminders are saved as `message` objects and their `messageId` is reused as next prompt anchor.

```typescript
const saved = await orchestrator.saveMessage(ctx, {
  message: { content: reminderText, role: 'system' },
  skipEmbeddings: true,
  threadId
})

const result = await runAgentStream({
  agent: orchestrator,
  ctx,
  promptMessageId: saved.messageId,
  threadId
})
await result.consumeStream()
```

### Post-Turn Todo Continuation Audit

There is no hook system in Convex Agent; continuation enforcement runs in orchestrator action after streaming completes.

```typescript
const postTurnAudit = async ({ ctx, threadId, turnRequestedInput }) => {
  const todos = await ctx.runQuery(internal.todos.listOwnedByThread, { threadId })
  const active = await ctx.runQuery(internal.tasks.countActiveByThread, { threadId })
  const runState = await ctx.runQuery(internal.orchestrator.getRunStateByThreadId, { threadId })
  const streak = runState?.autoContinueStreak ?? 0
  const session = await ctx.runQuery(internal.sessions.getByThreadIdInternal, { threadId })
  if (session?.status === 'archived') return

  let incomplete = 0
  for (const t of todos.todos) {
    if (t.status !== 'completed' && t.status !== 'cancelled') incomplete += 1
  }

  if (incomplete === 0) {
    await ctx.runMutation(internal.orchestrator.resetAutoContinueStreak, { threadId })
    return { shouldContinue: false }
  }
  if (active > 0) {
    await ctx.runMutation(internal.orchestrator.resetAutoContinueStreak, { threadId })
    return { shouldContinue: false }
  }
  if (turnRequestedInput) {
    await ctx.runMutation(internal.orchestrator.resetAutoContinueStreak, { threadId })
    return { shouldContinue: false }
  }
  if (streak >= 5) return { shouldContinue: false }

  const reminderText = buildTodoReminder({ todos: todos.todos })
  const saved = await orchestrator.saveMessage(ctx, {
    message: { content: reminderText, role: 'system' },
    skipEmbeddings: true,
    threadId
  })
  const enqueued = await ctx.runMutation(internal.orchestrator.enqueueRun, {
    incrementStreak: true,
    promptMessageId: saved.messageId,
    reason: 'todo_continuation',
    threadId
  })
  if (!enqueued.ok) return { shouldContinue: false }
  return { shouldContinue: true }
}
```

`turnRequestedInput` remains in the signature for v2 extensibility even though v1 orchestrator currently passes `false`.

---

## Concurrency Policy

### v1 Policy: Queue Per Thread

- Persisted state machine is stored in `threadRunState` keyed by `threadId`.
- Two states only: `idle` (no run) and `active` (run in progress). No `queued` state.
- "Queued" is represented by `queuedPromptMessageId` being set while status is `active`.
- One active orchestrator run per thread, with at most one queued continuation payload.
- `claimRun` is a consuming CAS write: sets `runClaimed: true` atomically; duplicate deliveries fail.
- New user messages persist immediately, then `enqueueRun` atomically updates queue state.
- Queue priority: `user_message` (2) > `task_completion` (1) > `todo_continuation` (0). Lower-priority enqueues do not overwrite higher-priority queued payloads. Equal-priority enqueues replace the older payload (newer `user_message` replaces older queued `user_message`).
- Auto-continue streak is tracked in `threadRunState.autoContinueStreak` (max 5).

### Atomic Transition Contract

```typescript
const enqueueRun = internalMutation({
  args: {
    incrementStreak: v.optional(v.boolean()),
    promptMessageId: v.optional(v.string()),
    reason: v.union(v.literal('user_message'), v.literal('task_completion'), v.literal('todo_continuation')),
    threadId: v.string()
  },
  handler: async (ctx, args) => {
    const state = await ensureRunState({ ctx, threadId: args.threadId })
    const shouldIncrement = args.incrementStreak === true

    if (shouldIncrement && state.autoContinueStreak >= 5) {
      return { ok: false, reason: 'streak_cap' }
    }

    let nextStreak = state.autoContinueStreak
    if (args.reason === 'user_message') nextStreak = 0
    if (shouldIncrement) nextStreak += 1

    if (state.status === 'idle') {
      const runToken = crypto.randomUUID()
      await ctx.scheduler.runAfter(0, internal.agents.runOrchestrator, {
        promptMessageId: args.promptMessageId,
        runToken,
        threadId: args.threadId
      })
      await ctx.db.patch(state._id, {
        activatedAt: Date.now(),
        activeRunToken: runToken,
        autoContinueStreak: nextStreak,
        claimedAt: undefined,
        queuedPriority: undefined,
        queuedPromptMessageId: undefined,
        queuedReason: undefined,
        runClaimed: false,
        status: 'active'
      })
      return { ok: true, scheduled: true }
    }

    const priority = { task_completion: 1, todo_continuation: 0, user_message: 2 }
    const queuedPriority = priority[state.queuedPriority ?? state.queuedReason ?? 'todo_continuation']
    const incomingPriority = priority[args.reason]
    if (incomingPriority < queuedPriority) return { ok: false, reason: 'lower_priority' }

    await ctx.db.patch(state._id, {
      autoContinueStreak: nextStreak,
      queuedPriority: args.reason,
      queuedPromptMessageId: args.promptMessageId,
      queuedReason: args.reason
    })
    return { ok: true, scheduled: false }
  }
})

const enqueueRunIfLatest = internalMutation({
  args: {
    expectedLatestMessageId: v.string(),
    incrementStreak: v.optional(v.boolean()),
    promptMessageId: v.optional(v.string()),
    reason: v.union(v.literal('user_message'), v.literal('task_completion'), v.literal('todo_continuation')),
    threadId: v.string()
  },
  handler: async (ctx, args) => {
    const latestMessages = await listUIMessages(ctx, components.agent, {
      paginationOpts: { cursor: null, numItems: 1 },
      threadId: args.threadId
    })
    const latest = latestMessages.page[0]?.id ?? null
    if (latest !== args.expectedLatestMessageId) return { ok: false, reason: 'not_latest' }
    const state = await ensureRunState({ ctx, threadId: args.threadId })
    const shouldIncrement = args.incrementStreak === true

    if (shouldIncrement && state.autoContinueStreak >= 5) {
      return { ok: false, reason: 'streak_cap' }
    }

    let nextStreak = state.autoContinueStreak
    if (args.reason === 'user_message') nextStreak = 0
    if (shouldIncrement) nextStreak += 1

    if (state.status === 'idle') {
      const runToken = crypto.randomUUID()
      await ctx.scheduler.runAfter(0, internal.agents.runOrchestrator, {
        promptMessageId: args.promptMessageId,
        runToken,
        threadId: args.threadId
      })
      await ctx.db.patch(state._id, {
        activatedAt: Date.now(),
        activeRunToken: runToken,
        autoContinueStreak: nextStreak,
        claimedAt: undefined,
        queuedPriority: undefined,
        queuedPromptMessageId: undefined,
        queuedReason: undefined,
        runClaimed: false,
        status: 'active'
      })
      return { ok: true, scheduled: true }
    }

    const priority = { task_completion: 1, todo_continuation: 0, user_message: 2 }
    const queuedPriority = priority[state.queuedPriority ?? state.queuedReason ?? 'todo_continuation']
    const incomingPriority = priority[args.reason]
    if (incomingPriority < queuedPriority) return { ok: false, reason: 'lower_priority' }

    await ctx.db.patch(state._id, {
      autoContinueStreak: nextStreak,
      queuedPriority: args.reason,
      queuedPromptMessageId: args.promptMessageId,
      queuedReason: args.reason
    })
    return { ok: true, scheduled: false }
  }
})

const claimRun = internalMutation({
  args: { runToken: v.string(), threadId: v.string() },
  handler: async (ctx, { runToken, threadId }) => {
    const state = await ensureRunState({ ctx, threadId })
    if (state.status !== 'active') return { ok: false }
    if (state.activeRunToken !== runToken) return { ok: false }
    if (state.runClaimed) return { ok: false }
    await ctx.db.patch(state._id, { claimedAt: Date.now(), runClaimed: true, runHeartbeatAt: Date.now() })
    return { ok: true }
  }
})

const finishRun = internalMutation({
  args: { runToken: v.string(), threadId: v.string() },
  handler: async (ctx, { runToken, threadId }) => {
    const state = await ensureRunState({ ctx, threadId })
    if (state.activeRunToken !== runToken) return { scheduled: false }

    if (state.queuedPromptMessageId) {
      const session = await ctx.db.query('session').withIndex('by_threadId', q => q.eq('threadId', threadId)).first()
      if (session?.status === 'archived') {
        await ctx.db.patch(state._id, {
          activatedAt: undefined,
          activeRunToken: undefined,
          claimedAt: undefined,
          queuedPriority: undefined,
          queuedPromptMessageId: undefined,
          queuedReason: undefined,
          runClaimed: undefined,
          runHeartbeatAt: undefined,
          status: 'idle'
        })
        return { scheduled: false }
      }
      const nextRunToken = crypto.randomUUID()
      await ctx.scheduler.runAfter(0, internal.agents.runOrchestrator, {
        promptMessageId: state.queuedPromptMessageId,
        runToken: nextRunToken,
        threadId
      })
      await ctx.db.patch(state._id, {
        activatedAt: Date.now(),
        activeRunToken: nextRunToken,
        claimedAt: undefined,
        queuedPriority: undefined,
        queuedPromptMessageId: undefined,
        queuedReason: undefined,
        runClaimed: false,
        runHeartbeatAt: undefined
      })
      return { scheduled: true }
    }
    await ctx.db.patch(state._id, {
      activatedAt: undefined,
      activeRunToken: undefined,
      claimedAt: undefined,
      runClaimed: undefined,
      runHeartbeatAt: undefined,
      status: 'idle'
    })
    return { scheduled: false }
  }
})
```

`enqueueRunIfLatest` uses `listUIMessages` from `@convex-dev/agent` to read the latest message inline. Component helper functions accept mutation `ctx` and access the component's tables through the component reference, avoiding the `ctx.runQuery` prohibition in mutations.

Note: both server-side `listUIMessages` and client-side `useUIMessages` return `UIMessage` objects. UIMessages have an `id` field (from AI SDK), not `_id`. All server-side code that reads from `listUIMessages` uses `.id` for message identification. All client-side rendering uses `.key` (the composite `${threadId}-${order}-${stepOrder}` identifier from `@convex-dev/agent`). Convex document `_id` is only used when accessing application-layer tables directly via `ctx.db`.

### Auto-Continue Streak Rules

- Reset to `0` on new user message (`enqueueRun` with `reason='user_message'`).
- Reset to `0` when turn ends for task-wait or user-input stop conditions.
- Reset to `0` when all todos are terminal (`completed`/`cancelled`).
- Increment by `1` only through `enqueueRun({ incrementStreak: true, ... })` so queue and streak updates are atomic.
- Hard cap: `5`; `enqueueRun` rejects auto-continue scheduling once cap is reached.
- Streak is incremented at enqueue time (inside the atomic `enqueueRun` / `enqueueRunIfLatest` mutation), not when the continuation run actually starts. If multiple task completions race and each calls `enqueueRun({ incrementStreak: true })`, only the one that wins the queue slot (equal-or-higher priority) increments the counter — lower-priority enqueues that are rejected do not consume a streak slot. However, a burst of equal-priority `task_completion` events can burn the cap (each replaces the prior queued payload and increments streak). This is an accepted v1 trade-off: the cap is a safety bound, not a precision counter. v2 can move streak increment to `claimRun` (when the run actually starts) for exact counting.

### v2 Improvement: Abort-and-Restart

Future upgrade:

- detect active stream by `threadId`
- abort active run
- restart from latest user message

v1 intentionally favors deterministic behavior and simpler recovery.

## Helper Functions

`threadRunState` is treated as a singleton per thread. `by_threadId` is a unique application-level invariant, enforced by querying with `.unique()` and failing fast if duplicates ever appear. Under Convex serializable transactions, concurrent first-callers for the same `threadId` are serialized: one insert wins and retried callers read the existing row.

```typescript
const ensureRunState = async ({ ctx, threadId }) => {
  const existing = await ctx.db
    .query('threadRunState')
    .withIndex('by_threadId', q => q.eq('threadId', threadId))
    .unique()
  if (existing) return existing
  try {
    const id = await ctx.db.insert('threadRunState', {
      autoContinueStreak: 0,
      status: 'idle',
      threadId
    })
    return await ctx.db.get(id)
  } catch (error) {
    const retried = await ctx.db
      .query('threadRunState')
      .withIndex('by_threadId', q => q.eq('threadId', threadId))
      .unique()
    if (retried) return retried
    throw error
  }
}

const resolveOwnedSessionByThread = async ({ ctx, threadId, userId }) => {
  const session = await ctx.db
    .query('session')
    .withIndex('by_user_threadId', q => q.eq('userId', userId).eq('threadId', threadId))
    .unique()
  if (!session) {
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_threadId', q => q.eq('threadId', threadId))
      .unique()
    if (!task) throw new Error('session_not_found')
    const ownerSession = await ctx.db.get(task.sessionId)
    if (!ownerSession || ownerSession.userId !== userId) throw new Error('session_not_found')
    return ownerSession
  }
  return session
}

const buildTaskCompletionReminder = ({ taskId, description, result }) => {
  return [
    '<system-reminder>',
    '[BACKGROUND TASK COMPLETED]',
    `Task ID: ${taskId}`,
    `Description: ${description}`,
    `Result: ${result ?? 'completed'}`,
    '',
    'Use taskOutput tool with this taskId to retrieve full results.',
    '</system-reminder>'
  ].join('\n')
}

const buildTodoReminder = ({ todos }) => {
  const lines = ['<system-reminder>', '[TODO CONTINUATION]', 'Incomplete tasks remain:', '']
  for (const t of todos) {
    if (t.status === 'completed' || t.status === 'cancelled') continue
    lines.push(`- [${t.status}] (${t.priority}) ${t.content}`)
  }
  lines.push('', 'Continue working on the next pending task.', '</system-reminder>')
  return lines.join('\n')
}

const normalizeGrounding = result => {
  const text = result.text ?? ''
  const sources = []
  const metadata = result.providerMetadata?.google
  if (metadata?.groundingChunks) {
    for (const chunk of metadata.groundingChunks) {
      if (chunk.web) {
        sources.push({
          snippet: chunk.web.snippet ?? '',
          title: chunk.web.title ?? '',
          url: chunk.web.uri ?? ''
        })
      }
    }
  }
  return { sources, summary: text }
}

const summarizeGroups = async ({ existingSummary, groups }) => {
  const { generateText } = await import('ai')
  const model = await getModel()
  const content = []
  if (existingSummary) content.push(`Previous summary:\n${existingSummary}`)
  for (const g of groups) {
    content.push(`Messages ${g.startId}..${g.endId}:\n${g.text}`)
  }
  const result = await generateText({
    model,
    prompt: `Summarize the following conversation context concisely, preserving key decisions, facts, and action items:\n\n${content.join('\n\n')}`,
    system: 'You are a conversation summarizer. Preserve all important details, decisions, and context.'
  })
  return result.text
}

const ensureServerToolsCache = async ({ ctx, serverId }) => {
  const server = await ctx.runQuery(internal.mcp.getServerById, { serverId })
  if (!server) return []
  const CACHE_TTL = 5 * 60 * 1000
  if (server.cachedTools && server.cachedAt && Date.now() - server.cachedAt < CACHE_TTL) {
    return server.cachedTools
  }
  let authHeaders = {}
  try {
    authHeaders = JSON.parse(server.authHeaders ?? '{}')
  } catch (_error) {
    return []
  }
  let transport
  try {
    transport = new StreamableHTTPClientTransport(new URL(server.url), {
      requestInit: { headers: authHeaders }
    })
  } catch (_error) {
    return []
  }
  const MCP_TIMEOUT_MS = 30_000
  const client = new Client({ name: 'noboil-agent', version: '1.0.0' }, { capabilities: {} })
  try {
    await Promise.race([client.connect(transport), new Promise((_, reject) => setTimeout(() => reject(new Error('mcp_connect_timeout')), MCP_TIMEOUT_MS))])
    const toolList = await Promise.race([client.listTools(), new Promise((_, reject) => setTimeout(() => reject(new Error('mcp_list_timeout')), MCP_TIMEOUT_MS))])
    const tools = []
    for (const t of toolList.tools) {
      tools.push({
        description: t.description ?? '',
        inputSchema: JSON.stringify(t.inputSchema),
        name: t.name
      })
    }
    await ctx.runMutation(internal.mcp.updateToolCache, { serverId, tools })
    return tools
  } finally {
    await client.close()
  }
}

const mockModel = {
  doGenerate: async ({ tools }) => {
    if (tools && tools.length > 0) {
      const firstTool = tools[0]
      const mockArgs: Record<string, unknown> = firstTool.name === 'delegate'
        ? { description: 'Test task', isBackground: true, prompt: 'Test prompt' }
        : firstTool.name === 'webSearch'
          ? { query: 'test' }
          : firstTool.name === 'todoWrite'
            ? { todos: [{ content: 'Test task', position: 0, priority: 'medium', status: 'pending' }] }
            : firstTool.name === 'taskStatus' || firstTool.name === 'taskOutput'
              ? { taskId: 'mock-task-id' }
              : firstTool.name === 'mcpCall'
                ? { serverName: 'test-server', toolArgs: '{}', toolName: 'test-tool' }
                : firstTool.name === 'mcpDiscover' || firstTool.name === 'todoRead'
                  ? {}
                  : {}
      return {
        content: [{ input: JSON.stringify(mockArgs), toolCallId: `mock-tc-${Date.now()}`, toolName: firstTool.name, type: 'tool-call' as const }],
        finishReason: 'tool-calls' as const,
        usage: { inputTokens: { total: 5 }, outputTokens: { total: 10 } },
        warnings: []
      }
    }
    return {
      content: [{ type: 'text' as const, text: 'Mock response for testing.' }],
      finishReason: 'stop' as const,
      usage: { inputTokens: { total: 5 }, outputTokens: { total: 10 } },
      warnings: []
    }
  },
  doStream: async () => ({
    stream: new ReadableStream({
      start: c => {
        c.enqueue({ type: 'stream-start', warnings: [] })
        c.enqueue({ id: 'mock-text-0', type: 'text-start' })
        c.enqueue({ delta: 'Mock.', id: 'mock-text-0', type: 'text-delta' })
        c.enqueue({ id: 'mock-text-0', type: 'text-end' })
        c.enqueue({ finishReason: 'stop', type: 'finish', usage: { inputTokens: { total: 5 }, outputTokens: { total: 10 } } })
        c.close()
      }
    })
  }),
  modelId: 'mock-model',
  provider: 'mock',
  specificationVersion: 'v3'
} as unknown as LanguageModel
```

## Internal Functions

Use `getRunStateByThreadId` consistently as the canonical query name. Replace all `getRunState` query references.

### `sessions.createSession`

```typescript
const createSession = m({
  args: { title: v.optional(v.string()) },
  handler: async c => {
    const { threadId } = await orchestrator.createThread(c.ctx, {
      title: c.args.title ?? 'New Session',
      userId: c.userId
    })
    const sessionId = await c.ctx.db.insert('session', {
      lastActivityAt: Date.now(),
      status: 'active',
      threadId,
      title: c.args.title ?? 'New Session',
      userId: c.userId
    })
    return { sessionId, threadId }
  }
})
```

### `sessions.getByThreadIdInternal`

```typescript
const getByThreadIdInternal = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    return await ctx.db
      .query('session')
      .withIndex('by_threadId', q => q.eq('threadId', threadId))
      .first()
  }
})

const getById = internalQuery({
  args: { sessionId: v.id('session') },
  handler: async (ctx, { sessionId }) => ctx.db.get(sessionId)
})

const scheduleRetry = internalMutation({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId)
    if (!task || task.status !== 'running') return
    const session = await ctx.db.get(task.sessionId)
    if (session?.status === 'archived') {
      await ctx.db.patch(taskId, { lastError: 'session_archived', status: 'cancelled' })
      return
    }
    const retryCount = task.retryCount + 1
    await ctx.db.patch(taskId, { pendingAt: Date.now(), retryCount, status: 'pending' })
    const delay = Math.min(1000 * Math.pow(2, retryCount), 30_000)
    await ctx.scheduler.runAfter(delay, internal.agents.runWorker, {
      prompt: task.prompt ?? task.description,
      taskId,
      threadId: task.threadId
    })
  }
})

const isTransientError = msg => {
  const transient = ['ECONNRESET', 'ETIMEDOUT', 'rate_limit', '503', '429', 'overloaded']
  const lower = msg.toLowerCase()
  for (const t of transient) {
    if (lower.includes(t.toLowerCase())) return true
  }
  return false
}
```

### `tasks.getByThreadIdInternal`

```typescript
const getByThreadIdInternal = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    return await ctx.db
      .query('tasks')
      .withIndex('by_threadId', q => q.eq('threadId', threadId))
      .first()
  }
})

const getById = internalQuery({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => ctx.db.get(taskId)
})
```

### `tasks.countActiveByThread`

```typescript
const countActiveByThread = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const running = await ctx.db
      .query('tasks')
      .withIndex('by_parentThreadId_status', q => q.eq('parentThreadId', threadId).eq('status', 'running'))
      .collect()
    const pending = await ctx.db
      .query('tasks')
      .withIndex('by_parentThreadId_status', q => q.eq('parentThreadId', threadId).eq('status', 'pending'))
      .collect()
    return running.length + pending.length
  }
})
```

### `tasks.getOwnedTaskOutput`

```typescript
const getOwnedTaskOutput = internalQuery({
  args: { requesterThreadId: v.string(), taskId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('session')
      .withIndex('by_threadId', q => q.eq('threadId', args.requesterThreadId))
      .first()
    if (!session) return null
    const task = await ctx.db.get(args.taskId as Id<'tasks'>)
    if (!task || task.sessionId !== session._id) return null
    if (task.status !== 'completed') return { error: 'task_not_completed', status: task.status }
    return { result: task.result, status: task.status }
  }
})
```

### `mcp.getOwnedServerByName`

```typescript
const getOwnedServerByName = internalQuery({
  args: { name: v.string(), userId: v.string() },
  handler: async (ctx, { name, userId }) => {
    return await ctx.db
      .query('mcpServers')
      .withIndex('by_user_name', q => q.eq('userId', userId).eq('name', name))
      .unique()
  }
})
```

### `mcp.listEnabledServersByUser`

```typescript
const listEnabledServersByUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query('mcpServers')
      .withIndex('by_user_enabled', q => q.eq('userId', userId).eq('isEnabled', true))
      .collect()
  }
})
```

### `mcp.getServerById`, `mcp.updateToolCache`, `mcp.refreshToolCache`

```typescript
const getServerById = internalQuery({
  args: { serverId: v.id('mcpServers') },
  handler: async (ctx, { serverId }) => ctx.db.get(serverId)
})

const updateToolCache = internalMutation({
  args: { serverId: v.id('mcpServers'), tools: v.array(v.object({ description: v.string(), inputSchema: v.string(), name: v.string() })) },
  handler: async (ctx, { serverId, tools }) => {
    await ctx.db.patch(serverId, { cachedAt: Date.now(), cachedTools: tools })
  }
})

const refreshToolCache = internalMutation({
  args: { serverId: v.id('mcpServers'), userId: v.string() },
  handler: async (ctx, { serverId }) => {
    await ctx.db.patch(serverId, { cachedAt: undefined, cachedTools: undefined })
  }
})
```

### `orchestrator.recordRunError`

```typescript
const recordRunError = internalMutation({
  args: { error: v.string(), threadId: v.string() },
  handler: async (ctx, { error, threadId }) => {
    const state = await ensureRunState({ ctx, threadId })
    await ctx.db.patch(state._id, { lastError: error })
  }
})

const heartbeatRun = internalMutation({
  args: { runToken: v.string(), threadId: v.string() },
  handler: async (ctx, { runToken, threadId }) => {
    const state = await ctx.db.query('threadRunState').withIndex('by_threadId', q => q.eq('threadId', threadId)).unique()
    if (!state || state.activeRunToken !== runToken) return
    await ctx.db.patch(state._id, { runHeartbeatAt: Date.now() })
  }
})
```

### `orchestrator.resetAutoContinueStreak`

```typescript
const resetAutoContinueStreak = internalMutation({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const state = await ensureRunState({ ctx, threadId })
    await ctx.db.patch(state._id, { autoContinueStreak: 0 })
  }
})
```

### `orchestrator.getRunStateByThreadId`

```typescript
const getRunStateByThreadId = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    return await ctx.db
      .query('threadRunState')
      .withIndex('by_threadId', q => q.eq('threadId', threadId))
      .unique()
  }
})
```

### `messages.getContextSize`

```typescript
const getContextSize = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const result = await listUIMessages(ctx, components.agent, {
      paginationOpts: { cursor: null, numItems: 500 },
      threadId
    })
    const messages = result.page
    let charCount = 0
    for (const m of messages) {
      charCount += JSON.stringify(m).length
    }
    const runState = await ctx.db
      .query('threadRunState')
      .withIndex('by_threadId', q => q.eq('threadId', threadId))
      .unique()
    if (runState?.compactionSummary) {
      charCount += runState.compactionSummary.length
    }
    return { charCount, messageCount: messages.length }
  }
})
```

### `todos.syncOwned`

Replaces all todos for a session with the provided list. Resolves session from thread.

```typescript
const syncOwned = internalMutation({
  args: {
    sessionThreadId: v.string(),
    todos: v.array(
      v.object({
        content: v.string(),
        position: v.number(),
        priority: v.union(v.literal('high'), v.literal('medium'), v.literal('low')),
        status: v.union(v.literal('pending'), v.literal('in_progress'), v.literal('completed'), v.literal('cancelled'))
      })
    )
  },
  handler: async (ctx, { sessionThreadId, todos }) => {
    const session = await ctx.db
      .query('session')
      .withIndex('by_threadId', q => q.eq('threadId', sessionThreadId))
      .first()
    if (!session) throw new Error('session_not_found')

    const existing = await ctx.db
      .query('todos')
      .withIndex('by_session', q => q.eq('sessionId', session._id))
      .collect()
    for (const e of existing) {
      await ctx.db.delete(e._id)
    }

    for (const t of todos) {
      await ctx.db.insert('todos', {
        content: t.content,
        position: t.position,
        priority: t.priority,
        sessionId: session._id,
        status: t.status,
        userId: session.userId
      })
    }
  }
})
```

### `todos.listOwnedByThread`

```typescript
const listOwnedByThread = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const session = await ctx.db
      .query('session')
      .withIndex('by_threadId', q => q.eq('threadId', threadId))
      .first()
    if (!session) return { todos: [] }
    const todos = await ctx.db
      .query('todos')
      .withIndex('by_session_position', q => q.eq('sessionId', session._id))
      .collect()
    return { todos }
  }
})
```

### `agents.runWorker`

```typescript
const runWorker = internalAction({
  args: { prompt: v.string(), taskId: v.id('tasks'), threadId: v.string() },
  handler: async (ctx, args) => {
    const marked = await ctx.runMutation(internal.tasks.markRunning, { taskId: args.taskId })
    if (!marked.ok) return

    const heartbeatInterval = setInterval(async () => {
      try {
        await ctx.runMutation(internal.tasks.updateHeartbeat, { taskId: args.taskId })
    } catch (_error) {}
    }, 30_000)

    try {
      const saved = await worker.saveMessage(ctx, {
        prompt: args.prompt,
        threadId: args.threadId
      })
      const result = await runAgentStream({
        agent: worker,
        ctx,
        promptMessageId: saved.messageId,
        systemPrefix: undefined,
        threadId: args.threadId
      })
      await result.consumeStream()

      const text = result.text ?? ''
      const completed = await ctx.runMutation(internal.tasks.completeTask, {
        result: text,
        taskId: args.taskId
      })

      if (completed.ok && completed.reminderMessageId) {
        await maybeContinueOrchestrator({ ctx, taskId: args.taskId })
      }
    } catch (error) {
      const task = await ctx.runQuery(internal.tasks.getById, { taskId: args.taskId })
      if (task && task.retryCount < 3 && isTransientError(String(error))) {
        await ctx.runMutation(internal.tasks.scheduleRetry, { taskId: args.taskId })
      } else {
        await ctx.runMutation(internal.tasks.failTask, {
          errorMessage: String(error),
          taskId: args.taskId
        })
      }
    } finally {
      clearInterval(heartbeatInterval)
    }
  }
})
```

`consumeStream()` must complete before reading `result.text`.

### `compaction.listClosedPrefixGroups`

Returns compactable message groups from the thread prefix. A "closed prefix group" is a contiguous range of messages that is fully resolved (no pending tool calls, no streaming). Only messages before the current active generation are eligible.

Boundary safety note: AI SDK v6 tool results are embedded in assistant `parts` (not separate `role: 'tool'` messages). If `safeEnd` lands on an assistant message with unresolved `tool-call` parts, move `safeEnd` back so compaction only includes closed tool-call sequences.

```typescript
const listClosedPrefixGroups = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const result = await listUIMessages(ctx, components.agent, {
      paginationOpts: { cursor: null, numItems: 500 },
      threadId
    })
    const messages = result.page
    messages.reverse()
    const runState = await ctx.db.query('threadRunState').withIndex('by_threadId', q => q.eq('threadId', threadId)).unique()
    const startAfter = runState?.lastCompactedMessageId
    if (startAfter) {
      const idx = messages.findIndex(m => m.id === startAfter)
      if (idx >= 0) messages.splice(0, idx + 1)
    }
    if (messages.length < 10) return []

    const cutoff = Math.floor(messages.length * 0.6)
    let safeEnd = cutoff - 1

    const hasUnpairedToolCall = idx => {
      const msg = messages[idx]
      if (!msg.parts) return false
      for (const part of msg.parts) {
        if (part.type === 'tool-call' && part.state !== 'result') return true
      }
      return false
    }

    const hasUnpairedToolCallInRange = end => {
      for (let i = 0; i <= end; i += 1) {
        if (hasUnpairedToolCall(i)) return true
      }
      return false
    }

    while (safeEnd >= 0) {
      if (hasUnpairedToolCallInRange(safeEnd)) {
        safeEnd -= 1
        continue
      }
      const msg = messages[safeEnd]
      const endsWithUnresolvedToolCall = msg.role === 'assistant' && Boolean(msg.parts?.some(p => p.type === 'tool-call' && p.state !== 'result'))
      if (endsWithUnresolvedToolCall) {
        safeEnd -= 1
        continue
      }
      break
    }
    if (safeEnd < 1) return []

    const text = messages
      .slice(0, safeEnd + 1)
      .map(m => {
        const parts = []
        for (const p of m.parts ?? []) {
          if (p.type === 'text') parts.push(p.text)
          if (p.type === 'tool-call' && p.state === 'result') {
            const resultText = typeof p.result === 'string' ? p.result : JSON.stringify(p.result)
            parts.push(`[tool:${p.toolName}] ${resultText}`)
          }
        }
        return `[${m.role}]: ${parts.join(' ')}`
      })
      .join('\n')

    return [
      {
        endId: messages[safeEnd].id,
        startId: messages[0].id,
        text
      }
    ]
  }
})
```

### `orchestrator.setCompactionSummary`

```typescript
const setCompactionSummary = internalMutation({
  args: { compactionSummary: v.string(), lastCompactedMessageId: v.string(), lockToken: v.string(), threadId: v.string() },
  handler: async (ctx, { compactionSummary, lastCompactedMessageId, lockToken, threadId }) => {
    const state = await ensureRunState({ ctx, threadId })
    if (state.compactionLock !== lockToken) return { ok: false }
    await ctx.db.patch(state._id, { compactionSummary, lastCompactedMessageId })
    return { ok: true }
  }
})
```

### `compaction.v1` deletion behavior

v1 compaction does not delete individual messages from the `@convex-dev/agent` component store.

1. Compaction generates a closed-prefix summary.
2. Summary is stored in `threadRunState.compactionSummary`.
3. Summary is injected as a system prefix on subsequent runs.
4. Old messages remain in the agent store.
5. Context is bounded by `contextOptions.recentMessages`, so old messages are excluded from active context.
6. Full message purging is deferred to v2 when the agent component exposes a bulk-delete API.

---

## Search Integration

### Why split search tool

`google.tools.googleSearch({})` is provider-defined. Mixing provider tools and function tools in one call can cause function tools to be ignored by provider prep logic.

### Design

1. `webSearch` in orchestrator/worker remains a function tool.
2. Function tool calls `internal.search.groundWithGemini` action.
3. That action makes a dedicated model call with only `google.tools.googleSearch({})` enabled.
4. Action records model usage through `internal.tokenUsage.recordModelUsage`.
5. Action returns normalized `{ summary, sources }` payload.
6. In test mode, `getModel()` returns the mock model; search tests should stub this action directly.

```typescript
const groundWithGemini = internalAction({
  args: { query: v.string(), threadId: v.string() },
  handler: async (ctx, { query, threadId }) => {
    const { generateText } = await import('ai')
    const { google } = await import('@ai-sdk/google')
    const model = await getModel()
    const out = await generateText({
      model,
      prompt: query,
      tools: {
        googleSearch: google.tools.googleSearch({})
      }
    })
    await ctx.runMutation(internal.tokenUsage.recordModelUsage, {
      agentName: 'search-bridge',
      outputTokens: out.usage?.outputTokens ?? 0,
      model: model.modelId,
      inputTokens: out.usage?.inputTokens ?? 0,
      provider: model.provider ?? 'google',
      threadId,
      totalTokens: out.usage?.totalTokens ?? 0
    })
    return normalizeGrounding(out)
  }
})
```

---

## MCP Integration

### v1 Transport

HTTP-only (`StreamableHTTPClientTransport`). `sse` is not part of v1 schema or UI.

### v1 Runtime Model

v1 keeps MCP integration as a generic bridge plus discovery:

1. `mcpCall` invokes a named tool on a named enabled server.
2. `mcpDiscover` lists available tools from enabled servers for model planning.
3. Tool schemas are not materialized into dynamic function tools in v1.

### Unknown Tool and TTL Retry

- If tool not found or schema mismatch occurs, refresh server cache and retry once.
- If retry fails, return structured error payload to model.

### v2 Improvement

Dynamic per-tool materialization from discovered schemas is deferred to v2.

### Core Action Pattern

MCP schema mismatch retry note: cache metadata is refreshed for UI display and subsequent planning, but the immediate retry still uses the same live MCP client connection. If the retry fails, the model receives a structured error and can retry on a later step with corrected arguments.

```typescript
import { Client } from '@modelcontextprotocol/client'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client/streamableHttp.js'

const callToolOwned = internalAction({
  args: {
    requesterThreadId: v.string(),
    serverName: v.string(),
    toolArgs: v.string(),
    toolName: v.string()
  },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(internal.sessions.getByThreadIdInternal, {
      threadId: args.requesterThreadId
    })
    let resolvedUserId
    if (session) {
      resolvedUserId = session.userId
    } else {
      const task = await ctx.runQuery(internal.tasks.getByThreadIdInternal, {
        threadId: args.requesterThreadId
      })
      if (!task) return { error: 'session_not_found', ok: false }
      const ownerSession = await ctx.runQuery(internal.sessions.getById, {
        sessionId: task.sessionId
      })
      if (!ownerSession) return { error: 'session_not_found', ok: false }
      resolvedUserId = ownerSession.userId
    }
    const server = await ctx.runQuery(internal.mcp.getOwnedServerByName, {
      name: args.serverName,
      userId: resolvedUserId
    })
    if (!server) return { error: 'server_not_found', ok: false }
    if (!server.isEnabled) return { error: 'server_disabled', ok: false, retryable: false }

    let authHeaders = {}
    try {
      authHeaders = JSON.parse(server.authHeaders ?? '{}')
    } catch (_error) {
      return { error: 'invalid_auth_headers', ok: false, retryable: false }
    }

    let transport
    try {
      transport = new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: { headers: authHeaders }
      })
    } catch (_error) {
      return { error: 'invalid_server_url', ok: false, retryable: false }
    }
    const MCP_TIMEOUT_MS = 30_000
    const client = new Client({ name: 'noboil-agent', version: '1.0.0' }, { capabilities: {} })

    try {
      await Promise.race([client.connect(transport), new Promise((_, reject) => setTimeout(() => reject(new Error('mcp_connect_timeout')), MCP_TIMEOUT_MS))])
      let parsed
      try {
        parsed = JSON.parse(args.toolArgs)
      } catch (error) {
        return { error: `invalid_tool_args: ${String(error)}`, ok: false, retryable: false }
      }
      try {
        const result = await Promise.race([client.callTool({ arguments: parsed, name: args.toolName }), new Promise((_, reject) => setTimeout(() => reject(new Error('mcp_call_timeout')), MCP_TIMEOUT_MS))])
        return { content: result.content, ok: true }
      } catch (error) {
        const message = String(error)
        const needsRetry = message.includes('tool_not_found') || message.includes('schema_mismatch')
        if (!needsRetry) {
          return { error: message, ok: false, retryable: false }
        }

        await ctx.runMutation(internal.mcp.refreshToolCache, {
          serverId: server._id,
          userId: resolvedUserId
        })

        try {
          const retryResult = await Promise.race([client.callTool({ arguments: parsed, name: args.toolName }), new Promise((_, reject) => setTimeout(() => reject(new Error('mcp_call_timeout')), MCP_TIMEOUT_MS))])
          return { content: retryResult.content, ok: true }
        } catch (retryError) {
          return {
            error: 'mcp_call_failed',
            message: String(retryError),
            ok: false,
            retryable: false
          }
        }
      }
    } catch (error) {
      const message = String(error)
      const retryableConnectionError =
        message.includes('ECONN') || message.includes('ETIMEDOUT') || message.includes('ENOTFOUND') ||
        message.includes('connection') || message.includes('network') || message.includes('503') ||
        message.includes('mcp_connect_timeout') || message.includes('mcp_call_timeout')
      return { error: message, ok: false, retryable: retryableConnectionError }
    } finally {
      await client.close()
    }
  }
})

```

```typescript
const discoverToolsOwned = internalAction({
  args: { requesterThreadId: v.string() },
  handler: async (ctx, { requesterThreadId }) => {
    const session = await ctx.runQuery(internal.sessions.getByThreadIdInternal, {
      threadId: requesterThreadId
    })
    let resolvedUserId
    if (session) {
      resolvedUserId = session.userId
    } else {
      const task = await ctx.runQuery(internal.tasks.getByThreadIdInternal, {
        threadId: requesterThreadId
      })
      if (!task) return { tools: [] }
      const ownerSession = await ctx.runQuery(internal.sessions.getById, {
        sessionId: task.sessionId
      })
      if (!ownerSession) return { tools: [] }
      resolvedUserId = ownerSession.userId
    }

    const servers = await ctx.runQuery(internal.mcp.listEnabledServersByUser, {
      userId: resolvedUserId
    })

    const tools = []
    const errors = []
    for (const server of servers) {
      try {
        const cached = await ensureServerToolsCache({ ctx, serverId: server._id })
        for (const tool of cached) {
          tools.push({
            description: tool.description,
            inputSchema: tool.inputSchema,
            serverName: server.name,
            toolName: tool.name
          })
        }
      } catch (error) {
        errors.push({ error: String(error), serverName: server.name })
      }
    }

    return { errors, tools }
  }
})
```

---

## Compaction

### Trigger Policy

Compaction runs **before generation starts**, based on current context footprint of thread:

- message count threshold
- or serialized character threshold

No trigger from cumulative token usage totals.

### Safety Model

1. Compact only a closed prefix, never in-flight streamed range.
2. Preserve complete tool call/result groups together.
3. Use `threadRunState.compactionLock` guard plus `compactionLockAt` lease expiry (10 minutes) for stale-lock recovery.
4. v1 stores compacted context as summary metadata and does not delete component-stored messages.

### Flow

1. Acquire compaction lock.
2. Build summary of compactable prefix plus existing summary context.
3. Save summary into `threadRunState.compactionSummary`.
4. Inject summary as a system prefix message in the next generation call.
5. Release compaction lock.

```typescript
const COMPACTION_CHAR_LIMIT = 100_000
const COMPACTION_MSG_LIMIT = 200
```

```typescript
const compactIfNeeded = async ({ ctx, threadId }) => {
  const size = await ctx.runQuery(internal.messages.getContextSize, { threadId })
  if (size.charCount < COMPACTION_CHAR_LIMIT && size.messageCount < COMPACTION_MSG_LIMIT) return

  const lockToken = crypto.randomUUID()
  const lock = await ctx.runMutation(internal.compaction.tryBeginCompaction, {
    lockToken,
    threadId
  })
  if (!lock.ok) return

  try {
    const state = await ctx.runQuery(internal.orchestrator.getRunStateByThreadId, { threadId })
    const groups = await ctx.runQuery(internal.compaction.listClosedPrefixGroups, { threadId })
    if (groups.length === 0) return
    const summary = await summarizeGroups({
      existingSummary: state?.compactionSummary,
      groups
    })
    await ctx.runMutation(internal.orchestrator.setCompactionSummary, {
      compactionSummary: summary,
      lastCompactedMessageId: groups[groups.length - 1].endId,
      lockToken,
      threadId
    })
  } finally {
    await ctx.runMutation(internal.compaction.finishCompaction, {
      lockToken,
      threadId
    })
  }
}
```

```typescript
const tryBeginCompaction = internalMutation({
  args: { lockToken: v.string(), threadId: v.string() },
  handler: async (ctx, { lockToken, threadId }) => {
    const state = await ensureRunState({ ctx, threadId })
    const now = Date.now()
    const LEASE_MS = 10 * 60 * 1000
    const leaseExpired = Boolean(state.compactionLock && state.compactionLockAt && now - state.compactionLockAt > LEASE_MS)
    if (state.compactionLock && !leaseExpired) return { ok: false }
    await ctx.db.patch(state._id, { compactionLock: lockToken, compactionLockAt: now })
    return { ok: true }
  }
})

const finishCompaction = internalMutation({
  args: { lockToken: v.string(), threadId: v.string() },
  handler: async (ctx, { lockToken, threadId }) => {
    const state = await ensureRunState({ ctx, threadId })
    if (state.compactionLock !== lockToken) return { ok: false }
    await ctx.db.patch(state._id, { compactionLock: undefined, compactionLockAt: undefined })
    return { ok: true }
  }
})
```

---

## Error Recovery

### Runtime Guardrails

- Wrap orchestrator and worker actions in `try/catch/finally`.
- Persist error state on task and thread-level metadata.
- Always finalize `threadRunState` transitions and compaction locks in `finally`.

### LLM Failure Mid-Stream

- mark task `error`
- set `lastError`
- increment `retryCount`
- retry if transient and `retryCount < 3`

### Action Timeout Recovery

- worker timeout target: 10 minutes
- cron scans running tasks
- if no heartbeat within timeout threshold, mark `timed_out`
- stale orchestrator-run recovery: if `threadRunState` is `active` and the latest heartbeat (`runHeartbeatAt`, falling back to `claimedAt`) is older than 15 minutes for claimed runs, or older than 5 minutes for unclaimed runs, recover to idle or immediately drain queued payload into a fresh run token

### MCP Failure Recovery

Tool returns structured model-readable error payload, not thrown raw exception:

```json
{
  "ok": false,
  "error": "mcp_call_failed",
  "message": "...",
  "retryable": true
}
```

### Terminal States

- `error`
- `timed_out`
- `cancelled`

---

## Streaming Architecture

### Server Streaming

AI SDK v6 finish reasons are limited to `stop`, `length`, `content-filter`, `tool-calls`, `error`, and `other`.
Requested-user-input inference is a documented v1 limitation: `runOrchestrator` passes `turnRequestedInput: false` on every turn. This means auto-continue can fire even when the assistant's last message asks the user a question. The `postTurnAudit` guard at `turnRequestedInput` (line 1059) is dead code in v1 since the value is always `false`. The streak cap (max 5) bounds the worst case, and any new user message resets the streak and takes priority in the queue. v2 can add structured input-request detection by inspecting tool outputs or assistant content patterns (e.g. messages ending with `?`), while keeping the existing `postTurnAudit` parameter shape.

```typescript
const runOrchestrator = internalAction({
  args: { promptMessageId: v.optional(v.string()), runToken: v.string(), threadId: v.string() },
  handler: async (ctx, args) => {
    const claimed = await ctx.runMutation(internal.orchestrator.claimRun, {
      runToken: args.runToken,
      threadId: args.threadId
    })
    if (!claimed.ok) return

    const isStale = async () => {
      const state = await ctx.runQuery(internal.orchestrator.getRunStateByThreadId, {
        threadId: args.threadId
      })
      return !state || state.activeRunToken !== args.runToken
    }

    const heartbeatInterval = setInterval(async () => {
      try {
        await ctx.runMutation(internal.orchestrator.heartbeatRun, {
          runToken: args.runToken,
          threadId: args.threadId
        })
      } catch (_error) {}
    }, 2 * 60 * 1000)

    try {
      if (await isStale()) return

      try {
        await compactIfNeeded({ ctx, threadId: args.threadId })
      } catch (_error) {}

      if (await isStale()) return
      const state = await ctx.runQuery(internal.orchestrator.getRunStateByThreadId, {
        threadId: args.threadId
      })
      const systemPrefix = state?.compactionSummary
        ? `Compaction summary:\n${state.compactionSummary}`
        : undefined

      const result = await runAgentStream({
        agent: orchestrator,
        ctx,
        promptMessageId: args.promptMessageId,
        systemPrefix,
        threadId: args.threadId
      })

      await result.consumeStream()

      if (await isStale()) return

      await postTurnAudit({
        ctx,
        threadId: args.threadId,
        turnRequestedInput: false
      })
    } catch (error) {
      await ctx.runMutation(internal.orchestrator.recordRunError, {
        error: String(error),
        threadId: args.threadId
      })
    } finally {
      clearInterval(heartbeatInterval)
      await ctx.runMutation(internal.orchestrator.finishRun, {
        runToken: args.runToken,
        threadId: args.threadId
      })
    }
  }
})
```

### Client Streaming

```typescript
const listMessages = query({
  args: {
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
    threadId: v.string()
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserIdOrTest(ctx)
    if (!userId) throw new Error('unauthenticated')
    const session = await ctx.db
      .query('session')
      .withIndex('by_user_threadId', q => q.eq('userId', userId).eq('threadId', args.threadId))
      .unique()
    if (!session) {
      const task = await ctx.db
        .query('tasks')
        .withIndex('by_threadId', q => q.eq('threadId', args.threadId))
        .unique()
      if (!task) throw new Error('thread_not_found')
      const ownerSession = await ctx.db.get(task.sessionId)
      if (!ownerSession || ownerSession.userId !== userId) throw new Error('thread_not_found')
    }
    const paginated = await listUIMessages(ctx, components.agent, args)
    const streams = await syncStreams(ctx, components.agent, args)
    return { ...paginated, streams }
  }
})
```

```tsx
const TaskWorkerStream = ({ threadId }: { threadId: string }) => {
  const { results, status } = useUIMessages(api.messages.listMessages, { threadId }, { initialNumItems: 50, stream: true })
  if (status === 'LoadingFirstPage') return <div className="animate-pulse text-sm text-muted-foreground">Worker running...</div>
  return (
    <div className="space-y-2 text-sm">
      {results.map(m => (
        <div key={m.key}>{m.text}</div>
      ))}
    </div>
  )
}
```

`useUIMessages` from `@convex-dev/agent/react` takes three arguments: the query reference, the query args object (e.g. `{ threadId }`), and an options object (e.g. `{ initialNumItems: 50, stream: true }`). The hook returns `{ results, status, loadMore }` where `status` is a paginated query status string (e.g. `'LoadingFirstPage'`, `'CanLoadMore'`, `'Exhausted'`). `WorkerStreamView` is inlined above as simple message rendering — v2 can extract a shared component if worker stream display needs richer formatting.

```tsx

const TaskPanel = ({ expandedTaskIds, tasks }) => {
  return (
    <>
      {tasks
        .filter(task => expandedTaskIds.has(task._id))
        .map(task => (
          <TaskWorkerStream key={task._id} threadId={task.threadId} />
        ))}
    </>
  )
}
```

---

## Frontend Structure

### Directory Layout

Co-location rule is enforced: page-specific components stay with their page.

```
apps/agent/
├── tsconfig.json
├── next.config.ts
├── middleware.ts
├── playwright.config.ts
├── src/
│   ├── app/
│   │   ├── convex-provider.tsx
│   │   ├── test-login-provider.tsx
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── (protected)/
│   │   │   └── auth-guard.tsx
│   │   ├── settings/
│   │   │   ├── page.tsx
│   │   │   ├── server-form.tsx
│   │   │   └── server-list.tsx
│   │   └── [sessionId]/
│   │       ├── page.tsx
│   │       ├── chat-log.tsx
│   │       ├── message-row.tsx
│   │       ├── reasoning-block.tsx
│   │       ├── tool-call-card.tsx
│   │       ├── task-panel.tsx
│   │       ├── todo-panel.tsx
│   │       ├── token-usage-panel.tsx
│   │       └── source-card.tsx
│   └── lib/
│       ├── a11y.ts
│       ├── format.ts
│       └── session-layout.ts
├── e2e/
├── package.json
├── PLAN.md
└── SOURCES.md
```

### Frontend File Specifications

Files listed in the tree above that do not have full code snippets are specified by role:

- `server-form.tsx` — MCP server add/edit form component. Uses `useMutation` for `addMcpServer`/`updateMcpServer`. Fields: name, url, authHeaders (textarea), isEnabled toggle.
- `server-list.tsx` — MCP server list component. Uses `useQuery` for `listMcpServers`. Renders server cards with edit/delete actions.
- `chat-log.tsx` — Scrollable message container. Uses `useUIMessages` with infinite scroll via `loadMore`. Renders `MessageRow` for each message.
- `message-row.tsx` — Single message renderer. Switches on message part types: text → inline, reasoning → `ReasoningBlock`, tool-call → `ToolCallCard`, source → `SourceCard`.
- `reasoning-block.tsx` — Collapsible reasoning/thinking display with expand/collapse toggle.
- `todo-panel.tsx` — Session todo list panel. Uses `useQuery(api.todos.listBySession)`. Renders todo items with status badges.
- `token-usage-panel.tsx` — Token usage summary panel. Uses `useQuery(api.tokenUsage.getSessionTotals)`. Shows prompt/completion/total token counts.
- `a11y.ts` — Accessibility utility helpers: `srOnly` class helper, `announceToScreenReader` live region function.
- `format.ts` — Formatting utilities: `formatTimestamp`, `formatTokenCount`, `truncateText`.
- `session-layout.ts` — Responsive layout hook: returns panel visibility state based on viewport width breakpoints.

These components follow the co-location rule (page-specific, not shared). Full implementations are produced during Phase 5 (Frontend).

### `apps/agent/middleware.ts`

```typescript
import { createProxy } from '@a/fe/proxy'

export default createProxy()

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] }
```

`createProxy()` only sets `x-pathname` for routing — this is the standard pattern used by all apps in this monorepo. `@convex-dev/auth` handles authentication entirely client-side through the `ConvexAuthNextjsProvider` wrapper: the provider manages auth tokens via Convex HTTP actions, not via Next.js middleware routes. No `convexAuthNextjsMiddleware` is needed.

### `apps/agent/next.config.ts`

Reuses shared config from `@a/fe`:

```typescript
import { createNextConfig } from '@a/fe/next-config'

export default createNextConfig({ transpilePackages: ['@a/be-agent', '@a/fe', '@a/ui'] })
```

### `apps/agent/playwright.config.ts`

```typescript
import { createPlaywrightConfig } from '@a/e2e/playwright-config'

export default createPlaywrightConfig({ port: 3005 })
```

### Responsive Layout Spec

- **Mobile (`<768px`)**: chat plus tabbed drawer/sheet for tasks, todos, sources, token usage.
- **Tablet (`md:` `>=768px`)**: one primary chat panel plus collapsible side rail.
- **Desktop (`lg:` `>=1024px`)**: fixed three-panel layout (chat center, task/todo rail right, sources rail far-right).

### Session List Page (`src/app/page.tsx`)

- Client component using `'use client'`.
- Uses `useQuery(api.sessions.list)` for v1 session list rendering.
- Includes a `New Session` button that calls `createSession` mutation, then navigates to `/${sessionId}`.
- Session card renders title, status badge, and last activity timestamp.
- Empty state shows an icon and `Start your first conversation`.
- Loading state uses skeleton session cards.

v1 intentionally returns a sorted array without cursor pagination; v2 can add cursor pagination if session counts grow large.

### Message Composer

- Reuses `PromptInput` pattern from `@a/ui/ai-elements/prompt-input`.
- `PromptInputTextarea` placeholder is `Send a message...`.
- `PromptInputSubmit` supports ready and submitted states.
- On submit, call `submitMessage` mutation, which atomically saves the message and enqueues the orchestrator run.
- Composer stays enabled at all times. When user submits while orchestrator is active, the message is saved and queued with `user_message` priority (highest). Queue delivery handles execution without blocking typing.

### Login Page (`src/app/login/page.tsx`)

- Renders Google OAuth sign-in button.
- Uses `@convex-dev/auth` client-side auth flow.
- Redirects to `/` after successful login.

### Settings Page (`src/app/settings/page.tsx`)

- Shows MCP server list with add, edit, and delete actions.
- Form includes `name`, `url`, optional `authHeaders`, and `isEnabled` toggle.
- Uses `useMutation` for CRUD operations on `mcpServers`.

### Chat Page (`src/app/[sessionId]/page.tsx`)

- Client component (no SSR preload). Uses `useQuery(api.sessions.getSession, { sessionId })` for session data. The agent app uses a separate Convex project, so server-side `preloadQuery` with auth tokens is not available (no shared auth cookie). All data fetching is client-side via `useQuery` and `useUIMessages`.
- Client chat surface uses `useUIMessages` for streaming messages.
- Responsive three-column layout: chat center, tasks+todos right, sources far-right.
- Message rendering supports text parts, reasoning blocks, tool call cards, and source cards.
- Message composer is bottom-anchored.

### Loading, Error, and Empty States

- Loading uses spinner for initial page load and skeletons for list contexts.
- Error handling uses root `ConvexErrorBoundary` plus inline tool-call error states.
- Empty states are explicit per context: sessions, messages, tasks, and todos.

### App Layout and Auth Wiring

Use the same server layout pattern as `apps/convex/chat/src/app/layout.tsx`.

The agent app cannot reuse `@a/fe/convex-provider` because that provider imports `@a/be-convex` (the demo backend). Instead, the layout defines an inline provider using `@convex-dev/auth/nextjs` and `convex/react` directly, targeting the agent app's own Convex project via `NEXT_PUBLIC_CONVEX_URL`.

```tsx
'use client'

import type { ReactNode } from 'react'

import { ConvexAuthNextjsProvider as AuthProvider } from '@convex-dev/auth/nextjs'
import { ConvexReactClient as Client } from 'convex/react'

const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? 'http://127.0.0.1:3210',
  client = new Client(url, { verbose: true }),
  AgentConvexProvider = ({ children }: { children: ReactNode }) => (
    <AuthProvider client={client}>{children}</AuthProvider>
  )

export default AgentConvexProvider
```

This provider lives at `apps/agent/src/app/convex-provider.tsx` (co-located with the layout). The layout imports it:

Auth gating is handled entirely client-side by `@convex-dev/auth`'s `useConvexAuth()` hook. Protected pages check `isAuthenticated` from the hook and redirect to `/login` if unauthenticated. The layout does NOT do server-side redirect — the agent app uses a separate Convex project and cannot use `@noboil/convex/next` `isAuthenticated()` (which is wired to the demo backend).

```tsx
import type { ReactNode } from 'react'

import type { Metadata } from 'next'

import AgentConvexProvider from './convex-provider'
import TestLoginProvider from './test-login-provider'

export const metadata: Metadata = { title: 'Agent' }

const Layout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body>
      <AgentConvexProvider>
        <TestLoginProvider>{children}</TestLoginProvider>
      </AgentConvexProvider>
    </body>
  </html>
)

export default Layout
```

This is the root layout (`src/app/layout.tsx`) with the required `<html>/<body>` shell. Auth gating is handled client-side by `@convex-dev/auth`'s `useConvexAuth()` hook in each page, not by server-side `isAuthenticated()`. Protected pages (session list, chat, settings) wrap their content in an `AuthGuard` component that checks `useConvexAuth().isAuthenticated` and redirects to `/login` if false. The login page checks auth state and redirects to `/` after successful sign-in.

`TestLoginProvider` lives at `apps/agent/src/app/test-login-provider.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'

import { useMutation } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '@a/be-agent'

const TestLoginProvider = ({ children }: { children: ReactNode }) => {
  const isTestMode = process.env.NEXT_PUBLIC_CONVEX_TEST_MODE === 'true'
  const signIn = useMutation(api.testauth.signInAsTestUser)
  const [ready, setReady] = useState(!isTestMode)

  useEffect(() => {
    if (!isTestMode) return
    signIn().then(() => setReady(true))
  }, [isTestMode, signIn])

  if (!ready) return null
  return <>{children}</>
}

export default TestLoginProvider
```

`signInAsTestUser` is a public mutation in `packages/be-agent/convex/testauth.ts` that calls `ensureTestUser` to insert or retrieve a deterministic test user row. No session token is returned — test mode relies on `getAuthUserIdOrTest` bypassing real auth on the backend, and `AuthGuard` bypassing auth checks on the frontend. The `TestLoginProvider` calls it on mount in test mode and waits for completion before rendering children.

`AuthGuard` is a client component used by protected pages (session list, chat, settings):

```tsx
'use client'

import type { ReactNode } from 'react'

import { useConvexAuth } from 'convex/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const AuthGuard = ({ children }: { children: ReactNode }) => {
  const isTestMode = process.env.NEXT_PUBLIC_CONVEX_TEST_MODE === 'true'
  const { isAuthenticated, isLoading } = useConvexAuth()
  const router = useRouter()

  useEffect(() => {
    if (isTestMode) return
    if (!isLoading && !isAuthenticated) router.replace('/login')
  }, [isAuthenticated, isLoading, isTestMode, router])

  if (isTestMode) return <>{children}</>
  if (isLoading || !isAuthenticated) return null
  return <>{children}</>
}

export default AuthGuard
```

`AuthGuard` lives co-located at `apps/agent/src/app/(protected)/auth-guard.tsx` and is imported by pages that require authentication. It checks `useConvexAuth()` from `convex/react` and redirects unauthenticated users to `/login`.

### Accessibility Requirements

- Chat transcript container uses `role="log"`.
- Streaming assistant area uses `aria-live="polite"`.
- Reasoning and tool-card expanders are keyboard-operable.
- Focus returns to input after send and after drawer close.
- Status indicators include text labels, not color-only communication.

### ToolCallCard Spec

States and rendering contract:

1. `queued`
2. `running`
3. `completed`
4. `error`

Card fields:

- tool name
- start/end time and duration
- collapsed input preview (JSON string)
- expandable output block
- explicit error block when present

### Reasoning Block Spec

- Stream reasoning parts in real time.
- Default collapsed with `Thinking...` label.
- Dim styling for reduced visual weight.
- Expand/collapse preserves user preference per message.

### Source Card Spec

- clickable URL
- provider title
- snippet from Gemini grounding
- open in new tab

---

## Backend Structure

### New Backend Package (`packages/be-agent/`)

```
packages/be-agent/
├── convex/
│   ├── _generated/
│   ├── convex.config.ts
│   ├── schema.ts
│   ├── auth.ts
│   ├── auth.config.ts
│   ├── testauth.ts
│   ├── http.ts
│   ├── crons.ts
│   ├── sessions.ts
│   ├── messages.ts
│   ├── orchestrator.ts
│   ├── agents.ts
│   ├── tasks.ts
│   ├── todos.ts
│   ├── mcp.ts
│   ├── search.ts
│   ├── tokenUsage.ts
│   ├── compaction.ts
│   ├── rateLimit.ts
│   ├── staleTaskCleanup.ts
│   └── retention.ts
├── ai.ts
├── env.ts
├── lazy.ts
├── prompts.ts
├── t.ts
├── models.mock.ts
├── check-schema.ts
├── SOURCES.md
├── package.json
└── tsconfig.json
```

### `convex.config.ts`

```typescript
import agent from '@convex-dev/agent/convex.config'
import { defineApp } from 'convex/server'

const app = defineApp()
app.use(agent)

export default app
```

## Configuration Files

### `packages/be-agent/convex/auth.ts`

```typescript
import Google from '@auth/core/providers/google'
import { convexAuth } from '@convex-dev/auth/server'

import '../env'

const { auth, isAuthenticated, signIn, signOut, store } = convexAuth({
  providers: [Google]
})

export { auth, isAuthenticated, signIn, signOut, store }
```

`import '../env'` ensures environment variable validation runs when the auth module loads. Auth depends on `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` — validating early prevents opaque runtime errors from missing credentials.

### `packages/be-agent/convex/testauth.ts`

Test auth helpers following `packages/be-convex/convex/testauth.ts` pattern:

```typescript
import { getAuthUserId } from '@convex-dev/auth/server'
import { makeTestAuth } from '@noboil/convex/test'
import { mutation, query } from './_generated/server'

const testAuth = makeTestAuth({
  getAuthUserId: getAuthUserId as (ctx: unknown) => Promise<null | string>,
  mutation,
  query
})

const { createTestUser, ensureTestUser, getAuthUserIdOrTest, isTestMode, TEST_EMAIL } = testAuth

const signInAsTestUser = mutation({
  handler: async ctx => {
    if (!isTestMode()) throw new Error('test_mode_only')
    const userId = await ensureTestUser(ctx)
    return { userId }
  }
})

export { createTestUser, ensureTestUser, getAuthUserIdOrTest, isTestMode, signInAsTestUser, TEST_EMAIL }
```

### `packages/be-agent/convex/auth.config.ts`

```typescript
export default {
  providers: [{
    domain: process.env.CONVEX_SITE_URL ?? '',
    applicationID: 'convex'
  }]
}
```

### `packages/be-agent/convex/http.ts`

```typescript
import { httpRouter } from 'convex/server'
import { auth } from './auth'

const http = httpRouter()
auth.addHttpRoutes(http)

export default http
```

### `packages/be-agent/convex/crons.ts`

```typescript
import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval('timeout stale tasks', { minutes: 5 }, internal.staleTaskCleanup.timeoutStaleTasks)
crons.interval('timeout stale orchestrator runs', { minutes: 5 }, internal.staleTaskCleanup.timeoutStaleRuns)
crons.interval('archive idle sessions', { hours: 1 }, internal.retention.archiveIdleSessions)
crons.cron('cleanup archived sessions', '0 3 * * *', internal.retention.cleanupArchivedSessions)

export default crons
```

### `packages/be-agent/env.ts`

```typescript
import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod/v4'

const env = createEnv({
  runtimeEnv: process.env,
  server: {
    AUTH_GOOGLE_ID: z.string().min(1).optional(),
    AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
    AUTH_SECRET: z.string().min(1),
    CONVEX_SITE_URL: z.string().url().optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional()
  },
  skipValidation: Boolean(
    process.env.CI || process.env.LINT || process.env.CONVEX_TEST_MODE
  )
})

export { env }
```

### `packages/be-agent/check-schema.ts`

```typescript
import { checkSchema } from '@noboil/convex/server'
import schema from './convex/schema'
import { owned } from './t'

checkSchema(schema, { owned })
```

### `packages/be-agent/models.mock.ts`

```typescript
import type { LanguageModel } from 'ai'

const mockModel = {
  doGenerate: async ({ tools }) => {
    if (tools && tools.length > 0) {
      const firstTool = tools[0]
      const mockArgs: Record<string, unknown> = firstTool.name === 'delegate'
        ? { description: 'Test task', isBackground: true, prompt: 'Test prompt' }
        : firstTool.name === 'webSearch'
          ? { query: 'test' }
          : firstTool.name === 'todoWrite'
            ? { todos: [{ content: 'Test task', position: 0, priority: 'medium', status: 'pending' }] }
            : firstTool.name === 'taskStatus' || firstTool.name === 'taskOutput'
              ? { taskId: 'mock-task-id' }
              : firstTool.name === 'mcpCall'
                ? { serverName: 'test-server', toolArgs: '{}', toolName: 'test-tool' }
                : firstTool.name === 'mcpDiscover' || firstTool.name === 'todoRead'
                    ? {}
                    : {}
      return {
        content: [{ input: JSON.stringify(mockArgs), toolCallId: `mock-tc-${Date.now()}`, toolName: firstTool.name, type: 'tool-call' as const }],
        finishReason: 'tool-calls' as const,
        usage: { inputTokens: { total: 5 }, outputTokens: { total: 10 } },
        warnings: []
      }
    }
    return {
      content: [{ type: 'text' as const, text: 'Mock response for testing.' }],
      finishReason: 'stop' as const,
      usage: { inputTokens: { total: 5 }, outputTokens: { total: 10 } },
      warnings: []
    }
  },
  doStream: async () => ({
    stream: new ReadableStream({
      start: c => {
        c.enqueue({ type: 'stream-start', warnings: [] })
        c.enqueue({ id: 'mock-text-0', type: 'text-start' })
        c.enqueue({ delta: 'Mock.', id: 'mock-text-0', type: 'text-delta' })
        c.enqueue({ id: 'mock-text-0', type: 'text-end' })
        c.enqueue({ finishReason: 'stop', type: 'finish', usage: { inputTokens: { total: 5 }, outputTokens: { total: 10 } } })
        c.close()
      }
    })
  }),
  modelId: 'mock-model',
  provider: 'mock',
  specificationVersion: 'v3'
} as unknown as LanguageModel

export { mockModel }
```

The mock model uses AI SDK v6 provider specification `v3`. `doGenerate` returns `{ content, finishReason, usage, warnings }` where `content` is an array of typed parts (`text`, `tool-call`, etc.). Tool calls use `{ type: 'tool-call', toolCallId, toolName, input }` where `input` is stringified JSON matching the tool's `inputSchema`. `doStream` emits `text-start`/`text-delta`/`text-end` triplets following the v3 streaming protocol. The mock inspects the first available tool's name and generates schema-compatible arguments. Specific test scenarios can intercept tool execution at the tool handler level.

### `packages/be-agent/tsconfig.json`

```json
{
  "compilerOptions": {
    "jsx": "preserve"
  },
  "exclude": ["node_modules"],
  "extends": "lintmax/tsconfig",
  "include": ["."]
}
```

### `apps/agent/tsconfig.json`

Standard Next.js app config extending monorepo base:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "incremental": true,
    "jsx": "preserve",
    "isolatedModules": true,
    "lib": ["dom", "dom.iterable", "esnext"],
    "moduleResolution": "bundler",
    "noEmit": true,
    "plugins": [{ "name": "next" }]
  },
  "exclude": ["node_modules"],
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"]
}
```

---

## Public API Endpoints (Frontend)

`sessions.list` returns session rows for v1 card rendering (`title`, `status`, `lastActivityAt`) sorted descending by activity.

`enqueueRunInline` mirrors `internal.orchestrator.enqueueRun` CAS logic for mutation-boundary safety in `submitMessage`; keep both implementations aligned because actions call the standalone internal mutation while `submitMessage` must stay inside one mutation boundary.

```typescript
const list = q({
  args: {},
  handler: async c => {
    const sessions = await c.ctx.db
      .query('session')
      .withIndex('by_user_status', q => q.eq('userId', c.userId))
      .collect()
    return sessions
      .filter(s => s.status !== 'archived')
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
  }
})

const getSession = q({
  args: { sessionId: v.id('session') },
  handler: async c => {
    const session = await c.ctx.db.get(c.args.sessionId)
    if (!session || session.userId !== c.userId) throw new Error('session_not_found')
    return session
  }
})

const enqueueRunInline = async ({ ctx, promptMessageId, reason, threadId, incrementStreak }) => {
  let state = await ctx.db
    .query('threadRunState')
    .withIndex('by_threadId', q => q.eq('threadId', threadId))
    .unique()
  if (!state) {
    try {
      const id = await ctx.db.insert('threadRunState', {
        autoContinueStreak: 0,
        status: 'idle',
        threadId
      })
      state = await ctx.db.get(id)
    } catch (error) {
      state = await ctx.db
        .query('threadRunState')
        .withIndex('by_threadId', q => q.eq('threadId', threadId))
        .unique()
      if (!state) throw error
    }
  }
  if (!state) throw new Error('run_state_not_found')

  const shouldIncrement = incrementStreak === true
  if (shouldIncrement && state.autoContinueStreak >= 5) {
    return { ok: false, reason: 'streak_cap' }
  }

  let nextStreak = state.autoContinueStreak
  if (reason === 'user_message') nextStreak = 0
  if (shouldIncrement) nextStreak += 1

  if (state.status === 'idle') {
    const runToken = crypto.randomUUID()
    await ctx.scheduler.runAfter(0, internal.agents.runOrchestrator, {
      promptMessageId,
      runToken,
      threadId
    })
    await ctx.db.patch(state._id, {
      activatedAt: Date.now(),
      activeRunToken: runToken,
      autoContinueStreak: nextStreak,
      claimedAt: undefined,
      queuedPriority: undefined,
      queuedPromptMessageId: undefined,
      queuedReason: undefined,
      runClaimed: false,
      status: 'active'
    })
    return { ok: true, scheduled: true }
  }

  const priority = { task_completion: 1, todo_continuation: 0, user_message: 2 }
  const queuedPriority = priority[state.queuedPriority ?? state.queuedReason ?? 'todo_continuation']
  const incomingPriority = priority[reason]
  if (incomingPriority < queuedPriority) return { ok: false, reason: 'lower_priority' }

  await ctx.db.patch(state._id, {
    autoContinueStreak: nextStreak,
    queuedPriority: reason,
    queuedPromptMessageId: promptMessageId,
    queuedReason: reason
  })
  return { ok: true, scheduled: false }
}

const submitMessage = m({
  args: { content: v.string(), sessionId: v.id('session') },
  handler: async c => {
    const session = await c.ctx.db.get(c.args.sessionId)
    if (!session || session.userId !== c.userId) throw new Error('session_not_found')
    if (session.status === 'archived') throw new Error('session_archived')
    const saved = await orchestrator.saveMessage(c.ctx, {
      message: { content: c.args.content, role: 'user' },
      threadId: session.threadId,
      userId: c.userId
    })
    await c.ctx.db.patch(c.args.sessionId, { lastActivityAt: Date.now(), status: session.status === 'idle' ? 'active' : session.status })
    await enqueueRunInline({
      ctx: c.ctx,
      incrementStreak: false,
      promptMessageId: saved.messageId,
      reason: 'user_message',
      threadId: session.threadId
    })
    return { messageId: saved.messageId }
  }
})

`submitMessage` is a single mutation transaction: `saveMessage` and `enqueueRunInline` execute atomically. If any step fails, the entire mutation rolls back. No race condition exists here because Convex mutations are serialized per-document.

const archiveSession = m({
  args: { sessionId: v.id('session') },
  handler: async c => {
    const session = await c.ctx.db.get(c.args.sessionId)
    if (!session || session.userId !== c.userId) throw new Error('session_not_found')
    await c.ctx.db.patch(c.args.sessionId, { archivedAt: Date.now(), status: 'archived' })
    const runState = await c.ctx.db
      .query('threadRunState')
      .withIndex('by_threadId', q => q.eq('threadId', session.threadId))
      .unique()
    if (runState) {
      await c.ctx.db.patch(runState._id, {
        queuedPriority: undefined,
        queuedPromptMessageId: undefined,
        queuedReason: undefined
      })
    }
  }
})

Archiving a session while an orchestrator run is in-flight does not abort the active run — the run finishes its current turn. `finishRun` checks the session's archived status and will not schedule queued payloads, and `maybeContinueOrchestrator` checks archived status before enqueuing continuation. Worker `completeTask` may still write a completion reminder to an archived thread, but `maybeContinueOrchestrator` will skip continuation because it checks `session?.status === 'archived'`. This is an accepted v1 trade-off — abruptly cancelling mid-stream runs would require a Convex action cancellation mechanism that does not exist.

const getRunState = q({
  args: { threadId: v.string() },
  handler: async c => {
    const session = await c.ctx.db
      .query('session')
      .withIndex('by_user_threadId', q => q.eq('userId', c.userId).eq('threadId', c.args.threadId))
      .unique()
    if (!session) return null
    return await c.ctx.db
      .query('threadRunState')
      .withIndex('by_threadId', q => q.eq('threadId', c.args.threadId))
      .unique()
  }
})

const listTasks = q({
  args: { sessionId: v.id('session') },
  handler: async c => {
    const session = await c.ctx.db.get(c.args.sessionId)
    if (!session || session.userId !== c.userId) return []
    return await c.ctx.db
      .query('tasks')
      .withIndex('by_session', q => q.eq('sessionId', c.args.sessionId))
      .collect()
  }
})

const listTodos = q({
  args: { sessionId: v.id('session') },
  handler: async c => {
    const session = await c.ctx.db.get(c.args.sessionId)
    if (!session || session.userId !== c.userId) return []
    return await c.ctx.db
      .query('todos')
      .withIndex('by_session_position', q => q.eq('sessionId', c.args.sessionId))
      .collect()
  }
})

const getTokenUsage = q({
  args: { sessionId: v.id('session') },
  handler: async c => {
    const session = await c.ctx.db.get(c.args.sessionId)
    if (!session || session.userId !== c.userId) {
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    }
    const usage = await c.ctx.db
      .query('tokenUsage')
      .withIndex('by_session', q => q.eq('sessionId', c.args.sessionId))
      .collect()
    let pt = 0
    let ct = 0
    let tt = 0
    for (const u of usage) {
      pt += u.inputTokens
      ct += u.outputTokens
      tt += u.totalTokens
    }
    return { inputTokens: pt, outputTokens: ct, totalTokens: tt }
  }
})

const listMcpServers = q({
  args: {},
  handler: async c => {
    return await c.ctx.db
      .query('mcpServers')
      .withIndex('by_user', q => q.eq('userId', c.userId))
      .collect()
  }
})

const addMcpServer = m({
  args: {
    authHeaders: v.optional(v.string()),
    isEnabled: v.optional(v.boolean()),
    name: v.string(),
    url: v.string()
  },
  handler: async c => {
    const existing = await c.ctx.db
      .query('mcpServers')
      .withIndex('by_user_name', q => q.eq('userId', c.userId).eq('name', c.args.name))
      .unique()
    if (existing) throw new Error('server_name_taken')
    return await c.ctx.db.insert('mcpServers', {
      authHeaders: c.args.authHeaders,
      cachedAt: undefined,
      cachedTools: undefined,
      isEnabled: c.args.isEnabled ?? true,
      name: c.args.name,
      transport: 'http',
      url: c.args.url,
      userId: c.userId
    })
  }
})

const updateMcpServer = m({
  args: {
    authHeaders: v.optional(v.string()),
    id: v.id('mcpServers'),
    isEnabled: v.optional(v.boolean()),
    name: v.optional(v.string()),
    url: v.optional(v.string())
  },
  handler: async c => {
    const server = await c.ctx.db.get(c.args.id)
    if (!server || server.userId !== c.userId) throw new Error('not_found')
    if (c.args.name !== undefined && c.args.name !== server.name) {
      const conflict = await c.ctx.db
        .query('mcpServers')
        .withIndex('by_user_name', q => q.eq('userId', c.userId).eq('name', c.args.name))
        .unique()
      if (conflict) throw new Error('server_name_taken')
    }
    const patch: Record<string, unknown> = {}
    if (c.args.name !== undefined) patch.name = c.args.name
    if (c.args.url !== undefined) {
      patch.url = c.args.url
      patch.cachedAt = undefined
      patch.cachedTools = undefined
    }
    if (c.args.authHeaders !== undefined) {
      patch.authHeaders = c.args.authHeaders
      patch.cachedAt = undefined
      patch.cachedTools = undefined
    }
    if (c.args.isEnabled !== undefined) patch.isEnabled = c.args.isEnabled
    await c.ctx.db.patch(c.args.id, patch)
  }
})

const deleteMcpServer = m({
  args: { id: v.id('mcpServers') },
  handler: async c => {
    const server = await c.ctx.db.get(c.args.id)
    if (!server || server.userId !== c.userId) throw new Error('not_found')
    await c.ctx.db.delete(c.args.id)
  }
})
```

---

## Auth and Ownership Boundary

### Public API Rule

Every public query and mutation follows this pattern:

1. resolve current user id
2. resolve requested entity
3. verify ownership relation
4. return or mutate

```typescript
const getOwnedTaskStatus = query({
  args: { requesterThreadId: v.string(), taskId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserIdOrTest(ctx)
    if (!userId) throw new Error('unauthenticated')
    const session = await resolveOwnedSessionByThread({
      ctx,
      threadId: args.requesterThreadId,
      userId
    })
    const task = await ctx.db.get(args.taskId as Id<'tasks'>)
    if (!task || task.sessionId !== session._id) return null
    return {
      completedAt: task.completedAt,
      lastError: task.lastError,
      retryCount: task.retryCount,
      status: task.status,
      threadId: task.threadId
    }
  }
})

const getOwnedTaskStatusInternal = internalQuery({
  args: { requesterThreadId: v.string(), taskId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('session')
      .withIndex('by_threadId', q => q.eq('threadId', args.requesterThreadId))
      .first()
    if (!session) return null
    const task = await ctx.db.get(args.taskId as Id<'tasks'>)
    if (!task || task.sessionId !== session._id) return null
    return {
      completedAt: task.completedAt,
      lastError: task.lastError,
      retryCount: task.retryCount,
      status: task.status,
      threadId: task.threadId
    }
  }
})
```

### Ownership Coverage

- session endpoints: `session.userId === currentUser`
- task endpoints: `task.sessionId -> session.userId === currentUser`
- thread endpoints: `threadId -> session.userId === currentUser`
- MCP endpoints: `mcpServer.userId === currentUser`

---

## Session Retention and Cleanup

### Retention Policy (v1)

- active sessions become idle after 1 day of inactivity
- idle sessions are archived after 7 days of inactivity (setting `status='archived'` and `archivedAt`)
- archived sessions are hard-deleted after 180 days
- internal auto-continuation (postTurnAudit, task-completion) checks session status and skips archived sessions
- submitting a message to an archived session returns `session_archived` error
- submitting a message to an idle session restores it to active status

### Cleanup Scope

When hard delete triggers for a session:

- delete task rows
- delete todo rows
- delete token usage rows
- delete `threadRunState` row

Agent thread and message data is managed by the `@convex-dev/agent` component and stored in component-internal tables. v1 deletes only application-layer rows (`tasks`, `todos`, `tokenUsage`, `threadRunState`, `session`). Component-layer thread/message rows are intentionally left as orphaned data in v1 because `@convex-dev/agent` does not currently expose a thread-deletion API. This means archived conversation content persists indefinitely in component storage even after the 180-day hard delete of application-layer rows. v2 will integrate component-layer cleanup once the agent SDK exposes a bulk-delete or thread-delete API — this is tracked as a known retention gap.

### Trigger

- hourly cron transitions active→idle (1 day) and idle→archived (7 days); nightly cron hard-deletes archived sessions older than 180 days
- manual archive action in UI remains available

### `convex/staleTaskCleanup.ts`

```typescript
const timeoutStaleTasks = internalMutation({
  handler: async ctx => {
    const now = Date.now()
    const STALE_MS = 10 * 60 * 1000
    const PENDING_STALE_MS = 5 * 60 * 1000
    const running = await ctx.db.query('tasks').withIndex('by_status', q => q.eq('status', 'running')).collect()
    for (const task of running) {
      const lastBeat = task.heartbeatAt ?? task.startedAt ?? task._creationTime
      if (now - lastBeat <= STALE_MS) continue
      const fresh = await ctx.db.get(task._id)
      if (!fresh || fresh.status !== 'running') continue
      await ctx.db.patch(task._id, { lastError: 'worker_timeout', status: 'timed_out' })
    }
    const pending = await ctx.db.query('tasks').withIndex('by_status', q => q.eq('status', 'pending')).collect()
    for (const task of pending) {
      const pendingSince = task.pendingAt ?? task._creationTime
      if (now - pendingSince <= PENDING_STALE_MS) continue
      const fresh = await ctx.db.get(task._id)
      if (!fresh || fresh.status !== 'pending') continue
      await ctx.db.patch(task._id, { lastError: 'worker_never_started', status: 'timed_out' })
    }
  }
})

const timeoutStaleRuns = internalMutation({
  handler: async ctx => {
    const now = Date.now()
    const RUN_STALE_MS = 15 * 60 * 1000
    const UNCLAIMED_STALE_MS = 5 * 60 * 1000
    const active = await ctx.db.query('threadRunState').withIndex('by_status', q => q.eq('status', 'active')).collect()
    for (const state of active) {
      const fresh = await ctx.db.get(state._id)
      if (!fresh || fresh.status !== 'active') continue

      if (fresh.runClaimed) {
        const lastBeat = fresh.runHeartbeatAt ?? fresh.claimedAt
        if (!lastBeat || now - lastBeat <= RUN_STALE_MS) continue
      } else {
        const activatedTime = fresh.activatedAt ?? fresh.claimedAt
        if (!activatedTime) continue
        const age = now - activatedTime
        if (age <= UNCLAIMED_STALE_MS) continue
      }

      const session = await ctx.db.query('session').withIndex('by_threadId', q => q.eq('threadId', fresh.threadId)).first()
      if (session?.status === 'archived') {
        await ctx.db.patch(fresh._id, {
          activatedAt: undefined,
          activeRunToken: undefined,
          claimedAt: undefined,
          queuedPriority: undefined,
          queuedPromptMessageId: undefined,
          queuedReason: undefined,
          runClaimed: undefined,
          runHeartbeatAt: undefined,
          status: 'idle'
        })
        continue
      }

      if (fresh.queuedPromptMessageId) {
        const runToken = crypto.randomUUID()
        await ctx.scheduler.runAfter(0, internal.agents.runOrchestrator, {
          promptMessageId: fresh.queuedPromptMessageId,
          runToken,
          threadId: fresh.threadId
        })
        await ctx.db.patch(fresh._id, {
          activatedAt: Date.now(),
          activeRunToken: runToken,
          claimedAt: undefined,
          queuedPriority: undefined,
          queuedPromptMessageId: undefined,
          queuedReason: undefined,
          runClaimed: false,
          runHeartbeatAt: undefined,
          status: 'active'
        })
        continue
      }

      await ctx.db.patch(fresh._id, {
        activatedAt: undefined,
        activeRunToken: undefined,
        claimedAt: undefined,
        runClaimed: undefined,
        runHeartbeatAt: undefined,
        status: 'idle'
      })
    }
  }
})
```

Lost-turn limitation: if an orchestrator run dies before answering and there is no `queuedPromptMessageId`, `timeoutStaleRuns` resets the thread to `idle` but does not replay the original prompt. That user turn is effectively lost — the user must resend. v2 can persist the active run's `promptMessageId` in `threadRunState` so `timeoutStaleRuns` can replay it on timeout.

Stale-run safety: when `timeoutStaleRuns` replaces an old run token with a new one, the old `runOrchestrator` action may still be executing. The old action checks `isStale()` (via `activeRunToken` mismatch) before streaming, after compaction, and after `consumeStream()` completes (before `postTurnAudit`). `finishRun` will reject the old run because `activeRunToken` no longer matches. Mid-stream writes (messages emitted by the agent during `consumeStream()`) can still land on the thread before the post-stream staleness check — this is an accepted v1 trade-off inherent to streaming architectures. The new run reads from the latest thread state, so duplicate messages are visible but do not corrupt control flow. v2 can add per-run message tagging to filter out stale-run messages from the UI.

### `convex/retention.ts`

```typescript
const archiveIdleSessions = internalMutation({
  handler: async ctx => {
    const now = Date.now()
    const IDLE_MS = 24 * 60 * 60 * 1000
    const active = await ctx.db.query('session').withIndex('by_status', q => q.eq('status', 'active')).collect()
    for (const s of active) {
      if (now - s.lastActivityAt > IDLE_MS) {
        await ctx.db.patch(s._id, { status: 'idle' })
      }
    }
    const idle = await ctx.db.query('session').withIndex('by_status', q => q.eq('status', 'idle')).collect()
    for (const s of idle) {
      if (now - s.lastActivityAt > IDLE_MS * 7) {
        await ctx.db.patch(s._id, { archivedAt: now, status: 'archived' })
        const runState = await ctx.db.query('threadRunState').withIndex('by_threadId', q => q.eq('threadId', s.threadId)).unique()
        if (runState) {
          await ctx.db.patch(runState._id, {
            queuedPriority: undefined,
            queuedPromptMessageId: undefined,
            queuedReason: undefined
          })
        }
      }
    }
  }
})

const cleanupArchivedSessions = internalMutation({
  handler: async ctx => {
    const now = Date.now()
    const ARCHIVE_TTL = 180 * 24 * 60 * 60 * 1000
    const archived = await ctx.db.query('session').withIndex('by_status', q => q.eq('status', 'archived')).collect()
    for (const s of archived) {
      if (!s.archivedAt || now - s.archivedAt <= ARCHIVE_TTL) continue
      const tasks = await ctx.db.query('tasks').withIndex('by_session', q => q.eq('sessionId', s._id)).collect()
      for (const t of tasks) await ctx.db.delete(t._id)
      const todos = await ctx.db.query('todos').withIndex('by_session', q => q.eq('sessionId', s._id)).collect()
      for (const t of todos) await ctx.db.delete(t._id)
      const usage = await ctx.db.query('tokenUsage').withIndex('by_session', q => q.eq('sessionId', s._id)).collect()
      for (const u of usage) await ctx.db.delete(u._id)
      const runState = await ctx.db.query('threadRunState').withIndex('by_threadId', q => q.eq('threadId', s.threadId)).unique()
      if (runState) await ctx.db.delete(runState._id)
      await ctx.db.delete(s._id)
    }
  }
})
```

---

## File Attachments

### v1 Decision

File upload attachments are out of scope for v1.

- users can paste text
- users cannot upload files in this version
- file upload and retrieval is tracked as post-v1 enhancement

---

## Testing Strategy

### Unit and Integration Tests

Core backend test coverage in `packages/be-agent/convex`:

1. orchestrator queue behavior
2. delegate mutation-first spawn lifecycle
3. worker completion reminder and latest-message gate
4. post-turn todo continuation loop guard
5. compaction closed-prefix safety
6. MCP cache refresh and retry behavior
7. ownership enforcement on all public APIs
8. timeout cron transitions to `timed_out`

### Deterministic Model Abstraction

Use model indirection pattern from `packages/be-convex/ai.ts`:

- production: Gemini 2.5 Flash
- tests: mock model deterministic outputs

### E2E Smoke Tests

Run at end of Phase 5:

1. create session, chat, stream response
2. delegate background task and observe status lifecycle
3. receive completion reminder and fetch `taskOutput`
4. todo continuation auto-turn when no user input needed
5. configure MCP server and execute one tool
6. grounded search returns source cards

### E2E Authentication Path

- In test mode (`CONVEX_TEST_MODE`), frontend auth detects test mode and bypasses Google OAuth.
- Backend uses `packages/be-agent/convex/testauth.ts` helpers (notably `createTestUser`) to create a deterministic test identity/session.
- Frontend wraps auth gating with a `TestLoginProvider` that auto-authenticates in test mode.
- This follows the existing `packages/be-convex/convex/testauth.ts` pattern.

`TestLoginProvider` is a client wrapper that checks `process.env.NEXT_PUBLIC_CONVEX_TEST_MODE`. In test mode, it calls the backend `signInAsTestUser` mutation on mount. `signInAsTestUser` calls `ensureTestUser` to insert or retrieve a deterministic test user row in the `users` table. No real auth session is created — instead, all backend API handlers use `getAuthUserIdOrTest` (from `makeTestAuth`), which returns the test user ID directly when `CONVEX_TEST_MODE` is set, bypassing `@convex-dev/auth`'s `getAuthUserId`. On the frontend, `AuthGuard` also checks `NEXT_PUBLIC_CONVEX_TEST_MODE` and passes through without requiring `useConvexAuth().isAuthenticated` in test mode. In production mode (`NEXT_PUBLIC_CONVEX_TEST_MODE` is unset), `TestLoginProvider` renders children directly, and `AuthGuard` enforces real Google OAuth authentication.

---

## Rate Limiting

Apply per-user limits with dedicated rules:

1. message submit rate: `20/minute/user`
2. delegation count: `10/minute/user`
3. grounded search calls: `30/minute/user`
4. MCP calls: `20/minute/user`

Exempt from limiter buckets:

- internal auto-continue enqueue/scheduling
- worker execution and worker heartbeats

Optional:

- per-session token budget ceiling with soft-block + UI warning

Implementation:

- use `rateLimitTables` from `convex-helpers/server/rateLimit`
- expose limit policy config per environment

Phase note: rate limit enforcement is implemented in Phase 6 (Polish). The schema already includes `rateLimitTables` and the backend tree already includes `rateLimit.ts`. Phase 6 wires `checkRateLimit` guards into `submitMessage`, `delegateTool.execute`, `webSearchTool.execute`, and `mcpCallTool.execute` using the limits above. Phase 2-5 code intentionally omits rate-limit checks for simpler bring-up.

### `convex/rateLimit.ts`

```typescript
import { defineRateLimits } from 'convex-helpers/server/rateLimit'

const RATE_LIMITS = {
  delegation: { kind: 'token bucket' as const, period: 60_000, rate: 10 },
  mcpCall: { kind: 'token bucket' as const, period: 60_000, rate: 20 },
  searchCall: { kind: 'token bucket' as const, period: 60_000, rate: 30 },
  submitMessage: { kind: 'token bucket' as const, period: 60_000, rate: 20 }
}

const { checkRateLimit, rateLimit, resetRateLimit } = defineRateLimits(RATE_LIMITS)

export { checkRateLimit, rateLimit, resetRateLimit }
```

Phase 6 wires `checkRateLimit` guards into `submitMessage`, `delegateTool.execute`, `webSearchTool.execute`, and `mcpCallTool.execute`. The definitions above are the Phase 1 scaffolding.

---

## Environment Variables

### Frontend env (`apps/agent/.env.local`)

| Variable | Dev | Test | Prod | Notes |
|---|---|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | optional (falls back to `http://127.0.0.1:3210`) | required | required | Agent app Convex URL, separate from demo apps |
| `NEXT_PUBLIC_CONVEX_TEST_MODE` | omit | `true` | omit | Enables `TestLoginProvider` bypass of Google OAuth |

`NEXT_PUBLIC_CONVEX_URL` follows Next.js `NEXT_PUBLIC_*` handling. In development, the provider falls back to `http://127.0.0.1:3210` when unset. In test and production, the variable must be set explicitly. No separate frontend `env.ts` is required for v1.
`NEXT_PUBLIC_CONVEX_TEST_MODE` is only set in test/E2E environments to enable the `TestLoginProvider` auto-login flow.

### Backend env (`packages/be-agent`, set with `convex env set`)

| Variable | Dev | Test | Prod | Notes |
|---|---|---|---|---|
| `CONVEX_DEPLOYMENT` | local deployment | test deployment | production deployment | Convex target for dev/deploy scripts |
| `AUTH_SECRET` | required | required | required | Auth.js encryption/signing secret handled server-side in Convex auth |
| `AUTH_GOOGLE_ID` | required when Google auth enabled | optional | required | OAuth client id used by `@convex-dev/auth` backend |
| `AUTH_GOOGLE_SECRET` | required when Google auth enabled | optional | required | OAuth client secret used by `@convex-dev/auth` backend |
| `CONVEX_SITE_URL` | optional | optional | optional | Domain for auth provider configuration |
| `GOOGLE_GENERATIVE_AI_API_KEY` | required in production | mock or test key | required | Gemini direct API path |

### Shared (both frontend and backend pipelines)

| Variable | Scope | Notes |
|---|---|---|
| `CONVEX_DEPLOYMENT` | turbo pass-through + backend runtime | Required for backend commands and deploy target wiring |
| `GOOGLE_GENERATIVE_AI_API_KEY` | turbo pass-through + backend runtime | Required for v1 model access |

Vertex AI support is deferred to v2. v1 uses the direct Google Generative AI API via `@ai-sdk/google`.

Auth secrets stay backend-only (`convex env set`) and are not frontend env vars.

---

## Deployment

### Separate Convex Project Commands

Local dev mirrors demo scripts but targets `packages/be-agent`:

```json
{
  "scripts": {
    "agent:convex:dev": "bun --cwd packages/be-agent with-env convex dev",
    "agent:convex:deploy": "bun --cwd packages/be-agent with-env convex deploy",
    "agent:dev": "bun --cwd apps/agent dev"
  }
}
```

### First-Time Setup

1. Create/select dedicated Convex project for `packages/be-agent`.
2. Set backend envs with `convex env set` in `packages/be-agent`.
3. Run `bun --cwd packages/be-agent with-env convex dev --once` to push schema/functions.
4. Start backend dev: `bun --cwd packages/be-agent with-env convex dev`.
5. Start frontend: `bun --cwd apps/agent dev`.

### Incremental Deploys

1. Run `bun fix` at repo root.
2. Deploy backend changes: `bun --cwd packages/be-agent with-env convex deploy`.
3. Deploy frontend app with `NEXT_PUBLIC_CONVEX_URL` for the agent deployment.
4. Verify cron jobs and rate-limit config in deployed environment.

### Deployment Notes

- no shared deployment with `packages/be-convex`
- independent env management
- independent migration rollout
- independent cron schedule

---

## Execution Phases

### Phase 1: Foundation

1. Create `packages/be-agent` as standalone Convex project with its own `convex.config.ts` and deployment.
2. Add auth setup and ownership helper primitives.
3. Add environment variable validation and wiring for app/backend.
4. Define `t.ts`, `schema.ts`, and `lazy.ts` using noboil patterns.
5. Implement session CRUD and ownership-safe thread mapping.
6. Verify: `bun fix` and `convex dev --once` pass for `packages/be-agent`.

### Phase 2: Agent Core

1. Implement orchestrator/worker agents with step limits.
2. Implement queue-per-thread orchestrator run policy.
3. Implement mutation-first delegate spawn + worker lifecycle mutations.
4. Implement reminder save and `messageId -> promptMessageId` chaining.
5. Implement todo continuation post-turn audit with max 5 auto-continues.
6. Implement error recovery and bounded retry logic.
7. Verify: streaming, delegation, reminders, retries, and queue behavior pass tests.

### Phase 3: Search and MCP

1. Implement `webSearch` function tool bridge to dedicated Gemini action.
2. Implement MCP server CRUD with ownership checks.
3. Implement HTTP-only MCP generic bridge (`mcpCall`) and discovery (`mcpDiscover`).
4. Implement TTL cache refresh and unknown-tool retry.
5. Verify: grounded search and MCP tool calls succeed with structured failures.

### Phase 4: Compaction and Tokens

1. Record token usage by thread via `usageHandler`.
2. Build session totals from `tokenUsage` query aggregation.
3. Implement pre-generation compaction by actual context size.
4. Protect compaction with closed-prefix grouping and lock flag.
5. Add stale task cron for timeout transitions.
6. Verify: compaction safety and timeout behavior.

### Phase 5: Frontend

1. Build session list, chat page, and settings page in `apps/agent`.
2. Implement streaming message rendering for text/reasoning/tool/source parts.
3. Implement ToolCallCard spec and task/todo/token panels.
4. Implement desktop/tablet/mobile responsive behavior.
5. Implement accessibility requirements for logs, live regions, and keyboard navigation.
6. Verify with focused Playwright specs.

### Phase 5.5: E2E Smoke

1. Add smoke suite for all core flows.
2. Run repeat verification for flaky-prone async flows.
3. Verify deterministic green runs in CI mode.

### Phase 6: Polish

1. Add session search and filter UX.
2. Keep source panel and source details UX.
3. Add rate limiting with user-facing exceeded state.
4. Exclude conversation export and tool approval flow from v1 scope.
5. Verify: `bun fix` and targeted tests pass.

### Phase 7: Extract `@noboil/agent`

1. Extract reusable agent harness primitives.
2. Move reusable hooks/components to `packages/agent`.
3. Dogfood by consuming extracted package inside `apps/agent`.
4. Add docs in `apps/docs` once extraction stabilizes.

---

## Source Tracking

Per-file source comments are removed. Canonical tracking is maintained in `SOURCES.md`.

### Canonical Location

- `apps/agent/SOURCES.md` for frontend borrowed mappings
- `packages/be-agent/SOURCES.md` for backend borrowed mappings

### Mapping Template

| Our File | OMO Source | What We Borrow |
|---|---|---|
| `packages/be-agent/convex/tasks.ts` | `src/features/background-agent/types.ts` | Task status model and lifecycle framing |
| `packages/be-agent/convex/agents.ts` | `src/features/background-agent/spawner.ts` | Delegation flow structure |
| `packages/be-agent/convex/agents.ts` | `src/hooks/todo-continuation-enforcer/hook.ts` | Continuation policy semantics |
| `packages/be-agent/convex/compaction.ts` | `src/hooks/compaction-context-injector/hook.ts` | Compaction summary strategy |
| `packages/be-agent/convex/mcp.ts` | `src/features/skill-mcp-manager/manager.ts` | MCP connect-call-close lifecycle |
| `packages/be-agent/prompts.ts` | `src/agents/sisyphus.ts` | Orchestrator prompt direction |
| `packages/be-agent/prompts.ts` | `src/agents/builtin-agents/general-agents.ts` | Worker prompt direction |

---

## Dependencies

### `packages/be-agent/package.json`

```json
{
  "name": "@a/be-agent",
  "private": true,
  "exports": {
    ".": "./convex/_generated/api.js",
    "./ai": "./ai.ts",
    "./lazy": "./lazy.ts",
    "./model": "./convex/_generated/dataModel.d.ts",
    "./server": "./convex/_generated/server.js",
    "./t": "./t.ts"
  },
  "scripts": {
    "build": "tsc",
    "check:schema": "bun ./check-schema.ts",
    "clean": "git clean -xdf .cache .turbo dist node_modules",
    "dev": "bun with-env convex dev",
    "lint": "eslint",
    "prod": "bun with-env convex deploy",
    "test": "CONVEX_TEST_MODE=true bun with-env bun test",
    "typecheck": "bun check:schema && tsc --noEmit",
    "with-env": "dotenv -e ../../.env --"
  },
  "dependencies": {
    "@auth/core": "latest",
    "@ai-sdk/google": "latest",
    "@convex-dev/agent": "latest",
    "@convex-dev/auth": "latest",
    "@modelcontextprotocol/client": "latest",
    "@noboil/convex": "workspace:*",
    "@t3-oss/env-core": "latest",
    "ai": "latest",
    "convex": "latest",
    "convex-helpers": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "convex-test": "latest"
  }
}
```

### `apps/agent/package.json`

```json
{
  "name": "@a/agent",
  "type": "module",
  "scripts": {
    "build": "bun with-env next build --turbo",
    "clean": "git clean -xdf .cache .next .turbo node_modules",
    "dev": "PORT=3005 bun with-env next dev --turbo",
    "lint": "eslint",
    "start": "bun with-env next start",
    "test": "NEXT_PUBLIC_CONVEX_TEST_MODE=true CONVEX_TEST_MODE=true bun with-env playwright test --reporter=dot",
    "test:e2e": "NEXT_PUBLIC_CONVEX_TEST_MODE=true CONVEX_TEST_MODE=true bun --cwd ../../packages/be-agent with-env convex dev --once && bun with-env playwright test --reporter=list",
    "typecheck": "tsc --noEmit",
    "with-env": "dotenv -e ../../.env --"
  },
  "dependencies": {
    "@a/be-agent": "workspace:*",
    "@a/fe": "workspace:*",
    "@a/ui": "workspace:*",
    "@ai-sdk/react": "latest",
    "@convex-dev/agent": "latest",
    "@convex-dev/auth": "latest",
    "@noboil/convex": "workspace:*",
    "ai": "latest",
    "convex": "latest",
    "lucide-react": "latest",
    "next": "latest",
    "react": "latest",
    "react-dom": "latest",
    "react-intersection-observer": "latest"
  },
  "devDependencies": {
    "@a/e2e": "workspace:*",
    "@playwright/test": "latest"
  }
}
```

---

## Monorepo Integration

### Root `package.json` Workspaces

```json
"workspaces": [
  "apps/agent",
  "apps/convex/*",
  "apps/docs",
  "apps/spacetimedb/*",
  "packages/*"
]
```

### `turbo.json` Pass-Through Env

```json
"globalPassThroughEnv": [
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_SECRET",
  "CONVEX_DEPLOYMENT",
  "GOOGLE_GENERATIVE_AI_API_KEY"
]
```

### Turbo Pipeline Alignment

`packages/be-agent` follows the same Turbo pipeline pattern as `packages/be-convex`.
No special Turbo configuration is required because workspace patterns already include `packages/*`.

---

## AGENTS.md Compliance Checklist

1. no unconstrained validators or loose typing in snippets
2. arrow functions only in snippets
3. no array callback aggregation shortcuts in snippets
4. no inline per-file source comments; use `SOURCES.md`
5. component co-location prioritized over global shared folders

---

## Success Criteria

1. Agent app uses a dedicated Convex deployment and URL separate from demo apps.
2. Public APIs enforce ownership checks from user -> session -> thread/task/server.
3. Orchestrator and worker enforce stop limits (`25` and `10`) and cannot infinite loop tools.
4. Delegate lifecycle is mutation-first with CAS task transitions and `timed_out` state.
5. Completion reminder chaining uses saved `messageId` and latest-message guard.
6. Search works through function tool bridge and returns summary plus sources.
7. Token usage is recorded through canonical `recordModelUsage` for orchestrator, worker, and search bridge.
8. Todo continuation audit runs post-turn with max 5 auto-continues, and streak increments happen atomically inside `enqueueRun`.
9. v1 concurrency uses two-state `threadRunState` (idle/active) with consuming `claimRun` CAS, queue priority (user > task > todo), stale-run recovery (`claimedAt` timeout), and remains non-blocking for input.
10. Compaction runs before generation on context size, stores summary in metadata, and preserves tool pair integrity.
11. MCP is HTTP-only, generic-bridge/discovery based, ownership-safe, cache-refreshable, parse-safe (`authHeaders`/`toolArgs`), and retry-aware.
12. Error recovery handles LLM, MCP, task timeout, and stale orchestrator-run failures with bounded retries and structured payloads.
13. Frontend renders tool/reasoning/source specs with responsive layouts and a11y compliance.
14. Session retention and cleanup policy is implemented and documented.
15. File attachments are explicitly out of scope for v1.
16. `SOURCES.md` is canonical for borrowed code tracking.
17. Public session APIs include owned `getSession` and manual `archiveSession`, and frontend list/chat pages consume them.
18. `bun fix` passes and targeted test suite plus e2e smoke tests pass.
