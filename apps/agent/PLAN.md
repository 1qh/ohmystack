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
│      │ - completion mut. │      │ - dynamic MCP tools  │                  │
│      └─────────┬────────┘      └─────────┬────────────┘                  │
│                │                         │                               │
├────────────────┼─────────────────────────┼───────────────────────────────┤
│ Tables                                                                    │
│ session | tasks | todos | mcpServers | tokenUsage | @convex-dev/agent    │
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
  -> mutation sessions.saveUserMessage
  -> mutation orchestrator.enqueueRun
  -> if no active run for thread: scheduler.runAfter(0, agents.runOrchestrator)

agents.runOrchestrator action
  -> ensure thread lock entry is active
  -> pre-generation compaction check on closed prefix
  -> streamText with function tools only, stepCountIs(25)
  -> await consumeStream
  -> post-turn audit:
       - read todos + running tasks
       - if incomplete todos and no active background work and no user-input request
         and consecutive auto-continue < 5
         then save reminder + enqueue one continuation
  -> release queue lock and trigger next queued run if present
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
  -> streamText with function tools only, stepCountIs(10)
  -> heartbeat mutation updates while running
  -> on success mutation tasks.completeTask
       - status completed
       - completedAt set
       - reminder inserted into parent thread as system message
       - completionNotifiedAt set
       - only continue orchestrator if completion reminder is latest message
  -> on failure mutation tasks.failTask
```

---

## Convex Schema

All schema and table design follows patterns from `packages/be-convex/t.ts`, `packages/be-convex/convex/schema.ts`, and `packages/be-convex/lazy.ts`.

### Backend Types (`packages/be-agent/t.ts`)

```typescript
import { makeOwned } from '@noboil/convex/schema'
import { object, string, enum as zenum } from 'zod/v4'

const owned = makeOwned({
  session: object({
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
import { ownedTable, rateLimitTable } from '@noboil/convex/server'
import { zodOutputToConvexFields as z2c } from 'convex-helpers/server/zod4'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { owned } from '../t'

export default defineSchema({
  ...authTables,
  ...rateLimitTable(),
  session: ownedTable(owned.session)
    .index('by_user_status', ['userId', 'status'])
    .index('by_user_threadId', ['userId', 'threadId']),
  tasks: defineTable({
    agent: v.string(),
    completedAt: v.optional(v.number()),
    completionNotifiedAt: v.optional(v.number()),
    description: v.string(),
    heartbeatAt: v.optional(v.number()),
    isBackground: v.boolean(),
    lastError: v.optional(v.string()),
    lastHeartbeatAt: v.optional(v.number()),
    parentThreadId: v.string(),
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
    .index('by_user_name', ['userId', 'name']),
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
    .index('by_threadId', ['threadId'])
})
```

### Notes

- `session.tokenUsage` is removed by design; session totals are derived from `tokenUsage` rows.
- `mcpServers.cachedTools[].inputSchema` and `toolArgs` are `v.string()` JSON payloads.
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

---

## Agent Definitions

### Orchestrator (Sisyphus-Web)

```typescript
import { Agent } from '@convex-dev/agent'
import { stepCountIs } from 'ai'

const orchestrator = new Agent(components.agent, {
  callSettings: {
    stopWhen: stepCountIs(25),
    temperature: 0.7
  },
  contextOptions: {
    excludeToolMessages: false,
    recentMessages: 100
  },
  instructions: ORCHESTRATOR_SYSTEM_PROMPT,
  languageModel: getModel,
  name: 'Orchestrator',
  tools: {
    delegate: delegateTool,
    mcpCall: mcpCallTool,
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
    stopWhen: stepCountIs(10),
    temperature: 0.5
  },
  contextOptions: { recentMessages: 50 },
  instructions: WORKER_SYSTEM_PROMPT,
  languageModel: getModel,
  name: 'Worker',
  tools: {
    mcpCall: mcpCallTool,
    webSearch: webSearchTool
  },
  usageHandler: usageHandlerByThread
})
```

### Usage Handler (thread-bound)

```typescript
const usageHandlerByThread = async (ctx, { model, provider, threadId, usage }) => {
  const session = await ctx.runQuery(internal.sessions.getByThreadIdInternal, { threadId })
  if (!session) return
  await ctx.runMutation(internal.tokenUsage.recordByThread, {
    agentName: usage.agentName,
    inputTokens: usage.inputTokens,
    model,
    outputTokens: usage.outputTokens,
    provider,
    sessionId: session._id,
    threadId,
    totalTokens: usage.totalTokens,
    userId: session.userId
  })
}
```

---

## Tool Definitions

### 1. `delegate`

Mutation-first spawn with atomic insert plus schedule.

```typescript
import { createTool } from '@convex-dev/agent'
import { z } from 'zod/v4'

const delegateTool = createTool({
  description:
    'Delegate a task to a worker agent. Returns taskId and worker threadId. The worker runs asynchronously.',
  execute: async (ctx, input) => {
    const spawn = await ctx.runMutation(internal.tasks.spawnTask, {
      description: input.description,
      isBackground: input.isBackground,
      parentThreadId: ctx.threadId,
      prompt: input.prompt
    })
    return {
      status: 'pending',
      taskId: spawn.taskId,
      threadId: spawn.threadId
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
    await ctx.runMutation(internal.todos.syncOwned, { sessionThreadId: ctx.threadId, todos })
    return { updated: todos.length }
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
    const todos = await ctx.runQuery(internal.todos.listOwnedByThread, { threadId: ctx.threadId })
    return { todos }
  },
  inputSchema: z.object({})
})
```

### 4. `taskStatus`

```typescript
const taskStatusTool = createTool({
  description: 'Check progress for a background task.',
  execute: async (ctx, { taskId }) => {
    return await ctx.runQuery(internal.tasks.getOwnedTaskStatus, {
      requesterThreadId: ctx.threadId,
      taskId
    })
  },
  inputSchema: z.object({ taskId: z.string() })
})
```

### 5. `taskOutput`

```typescript
const taskOutputTool = createTool({
  description: 'Get output for a completed background task.',
  execute: async (ctx, { taskId }) => {
    return await ctx.runQuery(internal.tasks.getOwnedTaskOutput, {
      requesterThreadId: ctx.threadId,
      taskId
    })
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
    const result = await ctx.runAction(internal.search.groundWithGemini, { query })
    return { sources: result.sources, summary: result.summary }
  },
  inputSchema: z.object({ query: z.string() })
})
```

### 7. `mcpCall`

```typescript
const mcpCallTool = createTool({
  description: 'Call a configured MCP tool.',
  execute: async (ctx, { serverName, toolArgs, toolName }) => {
    return await ctx.runAction(internal.mcp.callToolOwned, {
      requesterThreadId: ctx.threadId,
      serverName,
      toolArgs,
      toolName
    })
  },
  inputSchema: z.object({
    serverName: z.string(),
    toolArgs: z.string(),
    toolName: z.string()
  })
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

```typescript
const spawnTask = internalMutation({
  args: {
    description: v.string(),
    isBackground: v.boolean(),
    parentThreadId: v.string(),
    prompt: v.string()
  },
  handler: async (ctx, args) => {
    const session = await resolveOwnedSessionByThread({ ctx, threadId: args.parentThreadId })
    const thread = await worker.createThread(ctx, {
      title: args.description,
      userId: session.userId
    })
    const taskId = await ctx.db.insert('tasks', {
      agent: 'Worker',
      description: args.description,
      isBackground: args.isBackground,
      parentThreadId: args.parentThreadId,
      retryCount: 0,
      sessionId: session._id,
      status: 'pending',
      threadId: thread.threadId,
      userId: session.userId
    })
    await ctx.scheduler.runAfter(0, internal.agents.runWorker, {
      prompt: args.prompt,
      taskId,
      threadId: thread.threadId
    })
    return { taskId, threadId: thread.threadId }
  }
})
```

### Required Idempotent Fields

- `heartbeatAt`
- `lastHeartbeatAt`
- `completedAt`
- `completionNotifiedAt`
- `retryCount`
- `lastError`

### Completion Reminder Gating

Orchestrator auto-continue after task completion is allowed only when the completion reminder message is still the latest message in parent thread.

```typescript
const maybeContinueOrchestrator = async ({ ctx, parentThreadId, reminderMessageId }) => {
  const latest = await ctx.runQuery(internal.messages.getLatestMessageId, { threadId: parentThreadId })
  if (latest !== reminderMessageId) return
  await ctx.runMutation(internal.orchestrator.enqueueRun, {
    reason: 'task_completion',
    threadId: parentThreadId
  })
}
```

---

## Agent Runtime Flow

### Save Message and Prompt Chaining

System reminders are saved as `message` objects and their `messageId` is reused as next prompt anchor.

```typescript
const saved = await orchestrator.saveMessage(ctx, {
  message: { content: reminderText, role: 'system' },
  skipEmbeddings: true,
  threadId
})

const result = await orchestrator.streamText(
  ctx,
  { threadId },
  { promptMessageId: saved.messageId },
  {
    saveStreamDeltas: { chunking: 'word', throttleMs: 100 }
  }
)
await result.consumeStream()
```

### Post-Turn Todo Continuation Audit

There is no hook system in Convex Agent; continuation enforcement runs in orchestrator action after streaming completes.

```typescript
const postTurnAudit = async ({ ctx, autoContinueCount, threadId, turnRequestedInput }) => {
  const todos = await ctx.runQuery(internal.todos.listOwnedByThread, { threadId })
  const running = await ctx.runQuery(internal.tasks.countRunningByThread, { threadId })

  let incomplete = 0
  for (const t of todos.todos) {
    if (t.status !== 'completed' && t.status !== 'cancelled') incomplete += 1
  }

  if (incomplete === 0) return { shouldContinue: false }
  if (running > 0) return { shouldContinue: false }
  if (turnRequestedInput) return { shouldContinue: false }
  if (autoContinueCount >= 5) return { shouldContinue: false }

  const reminderText = buildTodoReminder({ todos: todos.todos })
  const saved = await orchestrator.saveMessage(ctx, {
    message: { content: reminderText, role: 'system' },
    skipEmbeddings: true,
    threadId
  })
  await ctx.runMutation(internal.orchestrator.enqueueRun, {
    promptMessageId: saved.messageId,
    reason: 'todo_continuation',
    threadId
  })
  return { shouldContinue: true }
}
```

---

## Concurrency Policy

### v1 Policy: Queue Per Thread

- One active orchestrator run per thread.
- New user messages always persist immediately.
- If a run is active, message enqueues one follow-up run.
- Completion of active run pulls next queued run.

### v2 Improvement: Abort-and-Restart

Future upgrade:

- detect active stream by `threadId`
- abort active run
- restart from latest user message

v1 intentionally favors deterministic behavior and simpler recovery.

---

## Search Integration

### Why split search tool

`google.tools.googleSearch({})` is provider-defined. Mixing provider tools and function tools in one call can cause function tools to be ignored by provider prep logic.

### Design

1. `webSearch` in orchestrator/worker remains a function tool.
2. Function tool calls `internal.search.groundWithGemini` action.
3. That action makes a dedicated model call with only `google.tools.googleSearch({})` enabled.
4. Action returns normalized `{ summary, sources }` payload.

```typescript
const groundWithGemini = internalAction({
  args: { query: v.string() },
  handler: async (_ctx, { query }) => {
    const { google } = await import('@ai-sdk/google')
    const { generateText } = await import('ai')
    const out = await generateText({
      model: google('gemini-2.5-flash'),
      prompt: query,
      tools: {
        googleSearch: google.tools.googleSearch({})
      }
    })
    return normalizeGrounding(out)
  }
})
```

---

## MCP Integration

### v1 Transport

HTTP-only (`StreamableHTTPClientTransport`). `sse` is not part of v1 schema or UI.

### Dynamic Tool Materialization

At each orchestrator or worker run start:

1. Load enabled MCP servers for current user.
2. Refresh stale tool caches based on TTL.
3. Build dynamic `createTool` entries from cached schemas for that single call.

### Unknown Tool and TTL Retry

- If tool not found or schema mismatch occurs, refresh server cache and retry once.
- If retry fails, return structured error payload to model.

### Core Action Pattern

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
    if (!session) return { error: 'session_not_found', ok: false }
    const server = await ctx.runQuery(internal.mcp.getOwnedServerByName, {
      name: args.serverName,
      userId: session.userId
    })
    if (!server) return { error: 'server_not_found', ok: false }

    const transport = new StreamableHTTPClientTransport(new URL(server.url), {
      requestInit: { headers: JSON.parse(server.authHeaders ?? '{}') }
    })
    const client = new Client({ name: 'noboil-agent', version: '1.0.0' }, { capabilities: {} })

    try {
      await client.connect(transport)
      const parsed = JSON.parse(args.toolArgs)
      const result = await client.callTool({ arguments: parsed, name: args.toolName })
      return { content: result.content, ok: true }
    } catch (error) {
      return { error: String(error), ok: false }
    } finally {
      await client.close()
    }
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
3. Use `compactionInProgress` guard to avoid concurrent compaction on same thread.

### Flow

1. Acquire compaction lock.
2. Build summary of compactable prefix.
3. Save summary as system message first.
4. Delete old message range via agent message-range APIs.
5. Release compaction lock.

```typescript
const compactIfNeeded = async ({ ctx, threadId }) => {
  const size = await ctx.runQuery(internal.messages.getContextSize, { threadId })
  if (size.charCount < COMPACTION_CHAR_LIMIT && size.messageCount < COMPACTION_MSG_LIMIT) return

  const lock = await ctx.runMutation(internal.compaction.tryBegin, { threadId })
  if (!lock.ok) return

  try {
    const groups = await ctx.runQuery(internal.compaction.listClosedPrefixGroups, { threadId })
    if (groups.length === 0) return
    const summary = await summarizeGroups({ groups })
    const saved = await orchestrator.saveMessage(ctx, {
      message: { content: summary, role: 'system' },
      skipEmbeddings: true,
      threadId
    })
    if (!saved.messageId) return
    await ctx.runAction(internal.compaction.deleteMessageRange, {
      endMessageId: groups[groups.length - 1].endMessageId,
      startMessageId: groups[0].startMessageId,
      threadId
    })
  } finally {
    await ctx.runMutation(internal.compaction.finish, { threadId })
  }
}
```

---

## Error Recovery

### Runtime Guardrails

- Wrap orchestrator and worker actions in `try/catch/finally`.
- Persist error state on task and thread-level metadata.
- Always release queue locks and compaction locks in `finally`.

### LLM Failure Mid-Stream

- mark task `error`
- set `lastError`
- increment `retryCount`
- retry if transient and `retryCount < 3`

### Action Timeout Recovery

- worker timeout target: 10 minutes
- cron scans running tasks
- if no heartbeat within timeout threshold, mark `timed_out`

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

```typescript
const runOrchestrator = internalAction({
  args: { promptMessageId: v.optional(v.string()), threadId: v.string() },
  handler: async (ctx, args) => {
    await compactIfNeeded({ ctx, threadId: args.threadId })

    const result = await orchestrator.streamText(
      ctx,
      { threadId: args.threadId },
      { promptMessageId: args.promptMessageId },
      {
        saveStreamDeltas: { chunking: 'word', throttleMs: 100 }
      }
    )

    await result.consumeStream()
    await postTurnAudit({
      autoContinueCount: await getAutoContinueCount({ ctx, threadId: args.threadId }),
      ctx,
      threadId: args.threadId,
      turnRequestedInput: result.finishReason === 'tool-call-user-confirmation'
    })
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
    const page = await listUIMessages(ctx, components.agent, args)
    const streams = await syncStreams(ctx, components.agent, args)
    return { ...page, streams }
  }
})
```

---

## Frontend Structure

### Directory Layout

Co-location rule is enforced: page-specific components stay with their page.

```
apps/agent/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── login/
│   │   │   └── page.tsx
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
└── PLAN.md
```

### Responsive Layout Spec

- **Desktop**: three panels (chat center, task/todo rail right, sources rail far-right).
- **Tablet**: one primary chat panel plus collapsible side rail.
- **Mobile**: chat plus tabbed drawer/sheet for tasks, todos, sources, token usage.

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
│   ├── sessions.ts
│   ├── messages.ts
│   ├── orchestratorQueue.ts
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
├── lazy.ts
├── prompts.ts
├── t.ts
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
    const session = await resolveOwnedSessionByThread({ ctx, threadId: args.requesterThreadId })
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

- active sessions remain indefinitely while active
- idle sessions archived after 30 days
- archived sessions hard-deleted after 180 days

### Cleanup Scope

When hard delete triggers for a session:

- delete task rows
- delete todo rows
- delete token usage rows
- delete thread/message rows via agent APIs

### Trigger

- nightly cron plus manual archive action in UI

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

---

## Rate Limiting

Apply per-user limits with dedicated rules:

1. message submit rate
2. delegation count per window
3. grounded search calls per window
4. MCP calls per window

Optional:

- per-session token budget ceiling with soft-block + UI warning

Implementation:

- reuse `rateLimitTable()` pattern
- expose limit policy config per environment

---

## Environment Variables

| Variable | Dev | Test | Prod | Notes |
|---|---|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | required | required | required | Agent app URL, separate from demo apps |
| `CONVEX_DEPLOYMENT` | local deployment | test deployment | production deployment | Used by `convex dev` and deploy scripts |
| `GOOGLE_GENERATIVE_AI_API_KEY` | optional if Vertex used | mock or test key | required unless Vertex used | Gemini direct API path |
| `GOOGLE_VERTEX_PROJECT` | optional | optional | optional | Vertex path |
| `GOOGLE_VERTEX_LOCATION` | optional | optional | optional | Vertex path |
| `GOOGLE_APPLICATION_CREDENTIALS` | optional | optional | optional | Vertex auth file |
| `AUTH_*` provider envs | required | required | required | Auth provider configuration |

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
3. Implement HTTP-only MCP calls with dynamic tool materialization.
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
  "dependencies": {
    "@ai-sdk/google": "latest",
    "@convex-dev/agent": "latest",
    "@modelcontextprotocol/client": "latest",
    "@noboil/convex": "workspace:*",
    "ai": "latest",
    "convex": "latest",
    "zod": "latest"
  }
}
```

### `apps/agent/package.json`

```json
{
  "dependencies": {
    "@ai-sdk/react": "latest",
    "@convex-dev/agent": "latest",
    "ai": "latest"
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
  "CONVEX_DEPLOYMENT",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_VERTEX_LOCATION",
  "GOOGLE_VERTEX_PROJECT"
]
```

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
4. Delegate lifecycle is mutation-first with idempotent task fields and `timed_out` state.
5. Completion reminder chaining uses saved `messageId` and latest-message guard.
6. Search works through function tool bridge and returns summary plus sources.
7. Todo continuation audit runs post-turn with max 5 auto-continues.
8. v1 concurrency uses queued runs per thread and remains non-blocking for input.
9. Compaction runs before generation on context size and preserves tool pair integrity.
10. MCP is HTTP-only, dynamic, ownership-safe, cache-refreshable, and retry-aware.
11. Error recovery handles LLM, MCP, and timeout failures with bounded retries.
12. Frontend renders tool/reasoning/source specs with responsive layouts and a11y compliance.
13. Session retention and cleanup policy is implemented and documented.
14. File attachments are explicitly out of scope for v1.
15. `SOURCES.md` is canonical for borrowed code tracking.
16. `bun fix` passes and targeted test suite plus e2e smoke tests pass.
