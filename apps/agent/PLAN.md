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

## Architecture

### Three Layers

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 16 + React 19)                            │
│  ┌────────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ AgentChat   │ │ TaskPanel │ │ TodoPanel│ │ TokenUsage  │ │
│  │ (streaming  │ │ (progress │ │ (status  │ │ (per-session│ │
│  │  messages,  │ │  polling, │ │  updates)│ │  tracking)  │ │
│  │  tool calls,│ │  logs)    │ │          │ │             │ │
│  │  reasoning) │ │           │ │          │ │             │ │
│  └─────┬───────┘ └─────┬────┘ └────┬─────┘ └──────┬──────┘ │
│        └───────────┬────┴───────────┴──────────────┘        │
│                    │ Convex reactive subscriptions            │
├────────────────────┼─────────────────────────────────────────┤
│  Convex Backend    │                                         │
│  ┌─────────────────┴──────────────────────────────────────┐ │
│  │ Orchestrator Agent (Sisyphus-Web)                       │ │
│  │  - Receives user messages                               │ │
│  │  - Decides: respond / use tools / delegate / search     │ │
│  │  - Manages todo list                                    │ │
│  │  - Gets system reminders for completed tasks            │ │
│  └──┬──────────────┬──────────────┬──────────────┬────────┘ │
│     │              │              │              │           │
│  ┌──┴───┐  ┌───────┴──────┐  ┌───┴────┐  ┌─────┴────────┐ │
│  │Sub-  │  │ Background   │  │ MCP    │  │ Gemini       │ │
│  │agents│  │ Task System  │  │ Client │  │ Grounding    │ │
│  │      │  │ (scheduled   │  │ (HTTP  │  │ Search       │ │
│  │      │  │  actions)    │  │  only) │  │              │ │
│  └──────┘  └──────────────┘  └────────┘  └──────────────┘ │
├──────────────────────────────────────────────────────────────┤
│  Convex Tables                                               │
│  sessions │ tasks │ todos │ mcpServers │ tokenUsage          │
│  + @convex-dev/agent internal tables                         │
│  (threads, messages, embeddings, streams)                    │
└──────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User sends message
  ↓
mutation: saveMessage → insert user msg into thread
  ↓
scheduler.runAfter(0, orchestratorAction)
  ↓ (non-blocking — user can keep chatting)
action: orchestratorAction
  ├─ streamText with saveStreamDeltas: true
  │   ↓ (frontend sees streaming via useUIMessages)
  ├─ tool call: webSearch → Gemini grounding search
  ├─ tool call: delegate → spawn sub-agent
  │   ↓
  │   mutation: insert task (status: pending)
  │   scheduler.runAfter(0, subAgentAction)
  │   ↓ (sub-agent streams to its own thread)
  │   action: subAgentAction
  │     ├─ streamText on sub-thread
  │     ├─ tool calls (MCP, search, etc.)
  │     └─ on complete: mutation: update task (status: completed)
  │                     mutation: inject system reminder into orchestrator thread
  │
  ├─ tool call: todoWrite → mutation: upsert todos
  ├─ tool call: todoRead → query: get todos
  ├─ tool call: mcpCall → action: connect + callTool + disconnect
  └─ on complete: mutation: update session tokenUsage
```

---

## Convex Schema

All schemas defined in Zod following noboil conventions.

### Backend Types (`packages/be-agent/t.ts`)

```typescript
import { makeOwned } from '@noboil/convex/schema'
import { zid } from 'convex-helpers/server/zod4'
import { array, boolean, number, object, string, union, enum as zenum } from 'zod/v4'

const owned = makeOwned({
  session: object({
    threadId: string(),
    title: string(),
    status: zenum(['active', 'idle', 'archived']),
    tokenUsage: object({
      input: number(),
      output: number()
    })
  })
})
```

### Additional Tables (raw Convex, not factory-managed)

```typescript
tasks: defineTable({
  sessionId: v.id('session'),
  threadId: v.string(),
  parentThreadId: v.string(),
  description: v.string(),
  agent: v.string(),
  status: v.union(
    v.literal('pending'),
    v.literal('running'),
    v.literal('completed'),
    v.literal('error'),
    v.literal('cancelled')
  ),
  progress: v.optional(v.object({
    toolCalls: v.number(),
    lastTool: v.optional(v.string()),
    lastUpdate: v.number()
  })),
  result: v.optional(v.string()),
  error: v.optional(v.string()),
  isBackground: v.boolean(),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number())
})
  .index('by_session', ['sessionId'])
  .index('by_status', ['status']),

todos: defineTable({
  sessionId: v.id('session'),
  content: v.string(),
  status: v.union(
    v.literal('pending'),
    v.literal('in_progress'),
    v.literal('completed'),
    v.literal('cancelled')
  ),
  priority: v.union(v.literal('high'), v.literal('medium'), v.literal('low'))
})
  .index('by_session', ['sessionId']),

mcpServers: defineTable({
  userId: v.string(),
  name: v.string(),
  url: v.string(),
  transport: v.union(v.literal('sse'), v.literal('http')),
  authHeaders: v.optional(v.string()),
  cachedTools: v.optional(v.array(v.object({
    name: v.string(),
    description: v.string(),
    inputSchema: v.optional(v.any())
  }))),
  cachedAt: v.optional(v.number()),
  isEnabled: v.boolean()
})
  .index('by_user', ['userId']),

tokenUsage: defineTable({
  sessionId: v.id('session'),
  model: v.string(),
  provider: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  totalTokens: v.number(),
  agentName: v.optional(v.string()),
  threadId: v.optional(v.string())
})
  .index('by_session', ['sessionId'])
```

---

## Agent Definitions

### Orchestrator (Sisyphus-Web)

Single orchestrator agent. Users don't configure it.

```typescript
import { Agent, createTool } from '@convex-dev/agent'
import { google } from '@ai-sdk/google'

const orchestrator = new Agent(components.agent, {
  name: 'Orchestrator',
  instructions: ORCHESTRATOR_SYSTEM_PROMPT,
  languageModel: google('gemini-2.5-flash'),
  tools: {
    webSearch: google.tools.googleSearch({}),
    delegate: delegateTool,
    todoWrite: todoWriteTool,
    todoRead: todoReadTool,
    taskStatus: taskStatusTool,
    taskOutput: taskOutputTool,
    mcpCall: mcpCallTool,
  },
  contextOptions: {
    recentMessages: 100,
    excludeToolMessages: false,
  },
  usageHandler: trackTokenUsage,
  callSettings: { temperature: 0.7 },
})
```

### Sub-Agent (Worker)

Generic worker agent for delegated tasks. Gets its own thread.

```typescript
const worker = new Agent(components.agent, {
  name: 'Worker',
  instructions: WORKER_SYSTEM_PROMPT,
  languageModel: google('gemini-2.5-flash'),
  tools: {
    webSearch: google.tools.googleSearch({}),
    mcpCall: mcpCallTool,
  },
  contextOptions: { recentMessages: 50 },
  usageHandler: trackTokenUsage,
  callSettings: { temperature: 0.5 },
})
```

### System Prompts

**Orchestrator** (adapted from oh-my-openagent `src/agents/sisyphus.ts`):
- Role: General-purpose web assistant with delegation capabilities
- Behavior: Classify intent → decide tool usage → respond or delegate
- Tools: web search, delegation, todo management, MCP, task polling
- No: file editing, code execution, terminal access

**Worker** (adapted from oh-my-openagent `src/agents/builtin-agents/general-agents.ts`):
- Role: Focused task executor
- Behavior: Complete assigned task, report results
- Tools: web search, MCP
- No: delegation, todo management

---

## Tool Definitions

### 1. `delegate` — Spawn Background Sub-Agent

```typescript
const delegateTool = createTool({
  description: 'Delegate a task to a background worker agent. Returns a task ID. The worker runs asynchronously — you will receive a system reminder when it completes.',
  inputSchema: z.object({
    description: z.string(),
    prompt: z.string(),
    isBackground: z.boolean().default(true),
  }),
  execute: async (ctx, input) => {
    const { threadId } = await worker.createThread(ctx, {
      userId: ctx.userId,
      title: input.description,
    })
    const taskId = await ctx.runMutation(internal.tasks.create, {
      sessionId: /* resolved from ctx */,
      threadId,
      parentThreadId: ctx.threadId,
      description: input.description,
      agent: 'Worker',
      isBackground: input.isBackground,
    })
    await ctx.scheduler.runAfter(0, internal.agents.runWorker, {
      taskId, threadId, prompt: input.prompt,
    })
    return { taskId, threadId, status: 'pending' }
  },
})
```

**Borrowed from**: `oh-my-openagent/src/tools/delegate-task/tools.ts` (task creation pattern), `oh-my-openagent/src/features/background-agent/spawner.ts` (fire-and-forget spawn pattern)

### 2. `todoWrite` — Manage Todo List

```typescript
const todoWriteTool = createTool({
  description: 'Create or update the todo list for the current session.',
  inputSchema: z.object({
    todos: z.array(z.object({
      content: z.string(),
      status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
      priority: z.enum(['high', 'medium', 'low']),
    })),
  }),
  execute: async (ctx, { todos }) => {
    await ctx.runMutation(internal.todos.sync, {
      sessionId: /* resolved */,
      todos,
    })
    return { updated: todos.length }
  },
})
```

**Borrowed from**: `oh-my-openagent/src/tools/task/types.ts` (todo schema), `oh-my-openagent/src/features/claude-tasks/storage.ts` (sync pattern)

### 3. `todoRead` — Read Todo List

```typescript
const todoReadTool = createTool({
  description: 'Read the current todo list for this session.',
  inputSchema: z.object({}),
  execute: async (ctx) => {
    return await ctx.runQuery(internal.todos.list, {
      sessionId: /* resolved */,
    })
  },
})
```

### 4. `taskStatus` — Check Background Task Progress

```typescript
const taskStatusTool = createTool({
  description: 'Check the status and progress of a background task.',
  inputSchema: z.object({ taskId: z.string() }),
  execute: async (ctx, { taskId }) => {
    return await ctx.runQuery(internal.tasks.get, { taskId })
  },
})
```

### 5. `taskOutput` — Get Background Task Result

```typescript
const taskOutputTool = createTool({
  description: 'Get the full output of a completed background task.',
  inputSchema: z.object({
    taskId: z.string(),
  }),
  execute: async (ctx, { taskId }) => {
    // Read the sub-agent's thread messages
    const task = await ctx.runQuery(internal.tasks.get, { taskId })
    const messages = await ctx.runQuery(internal.threads.getMessages, {
      threadId: task.threadId, limit: 50,
    })
    return { task, messages }
  },
})
```

**Borrowed from**: `oh-my-openagent/src/tools/background-task/create-background-output.ts` (output retrieval pattern)

### 6. `mcpCall` — Call MCP Server Tool

```typescript
const mcpCallTool = createTool({
  description: 'Call a tool on a configured MCP server.',
  inputSchema: z.object({
    serverName: z.string(),
    toolName: z.string(),
    toolArgs: z.record(z.unknown()),
  }),
  execute: async (ctx, { serverName, toolName, toolArgs }) => {
    return await ctx.runAction(internal.mcp.callTool, {
      userId: ctx.userId,
      serverName, toolName, toolArgs,
    })
  },
})
```

**Borrowed from**: `oh-my-openagent/src/features/skill-mcp-manager/manager.ts` (connection lifecycle), `oh-my-openagent/src/mcp/index.ts` (MCP registry pattern)

---

## Background Task Lifecycle

### Task States

```
pending → running → completed
                  → error
                  → cancelled
```

**Borrowed from**: `oh-my-openagent/src/features/background-agent/types.ts`

### System Reminder on Completion

When a background task completes, inject a system message into the orchestrator's thread:

```typescript
const notifyOrchestrator = async (ctx, task) => {
  const remainingTasks = await ctx.runQuery(internal.tasks.countRunning, {
    sessionId: task.sessionId,
  })
  const allComplete = remainingTasks === 0
  const reminderText = allComplete
    ? `<system-reminder>
[ALL BACKGROUND TASKS COMPLETE]

**Completed:**
- \`${task._id}\`: ${task.description}

Use \`taskOutput(taskId="${task._id}")\` to retrieve the result.
</system-reminder>`
    : `<system-reminder>
[BACKGROUND TASK COMPLETED]
**ID:** \`${task._id}\`
**Description:** ${task.description}
**Duration:** ${formatDuration(task.startedAt, task.completedAt)}

**${remainingTasks} task(s) still in progress.**
Use \`taskOutput(taskId="${task._id}")\` to retrieve this result when ready.
</system-reminder>`

  await orchestrator.saveMessage(ctx, {
    threadId: task.parentThreadId,
    prompt: reminderText,
    skipEmbeddings: true,
  })
  await ctx.scheduler.runAfter(0, internal.agents.continueOrchestrator, {
    threadId: task.parentThreadId,
  })
}
```

**Borrowed from**: `oh-my-openagent/src/features/background-agent/background-task-notification-template.ts` (exact template format)

### Todo Continuation Reminder

When the orchestrator responds without completing all todos, inject:

```typescript
const todoReminderText = `<system-reminder>
[SYSTEM DIRECTIVE - TODO CONTINUATION]

Incomplete tasks remain in your todo list. Continue working on the next pending task.

- Proceed without asking for permission
- Mark each task complete when finished
- Do not stop until all tasks are done

[Status: ${completed}/${total} completed, ${remaining} remaining]

Remaining tasks:
${pendingTodos.map(t => `- [${t.status}] ${t.content}`).join('\n')}
</system-reminder>`
```

**Borrowed from**: `oh-my-openagent/src/hooks/todo-continuation-enforcer/hook.ts` (continuation enforcement pattern)

---

## MCP Integration

### Server-Side (Convex Action)

```typescript
import { Client } from '@modelcontextprotocol/client'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client/streamableHttp.js'

const callMcpTool = internalAction({
  args: {
    userId: v.string(),
    serverName: v.string(),
    toolName: v.string(),
    toolArgs: v.any(),
  },
  handler: async (ctx, { userId, serverName, toolName, toolArgs }) => {
    const server = await ctx.runQuery(internal.mcpServers.getByName, {
      userId, name: serverName,
    })
    const transport = new StreamableHTTPClientTransport(
      new URL(server.url),
      { requestInit: { headers: JSON.parse(server.authHeaders ?? '{}') } }
    )
    const client = new Client(
      { name: 'noboil-agent', version: '1.0.0' },
      { capabilities: {} }
    )
    try {
      await client.connect(transport)
      const result = await client.callTool({ name: toolName, arguments: toolArgs })
      return result.content
    } finally {
      await client.close()
    }
  },
})
```

**Borrowed from**: `oh-my-openagent/src/features/skill-mcp-manager/manager.ts` (connect-use-close lifecycle), `oh-my-openagent/src/features/skill-mcp-manager/http-client.ts` (StreamableHTTPClientTransport usage)

### Tool Discovery Cache

```typescript
const refreshTools = internalAction({
  handler: async (ctx, { serverId }) => {
    // Connect, listTools(), cache in mcpServers.cachedTools
    // 5-minute TTL on cache
  },
})
```

### User-Facing API

```typescript
// List available MCP servers
const listServers = query({ ... })

// Add/remove/toggle MCP server
const addServer = mutation({ ... })
const removeServer = mutation({ ... })
const toggleServer = mutation({ ... })
```

---

## Compaction

When token usage exceeds threshold (tracked by `usageHandler`), schedule compaction:

```typescript
const compactThread = internalAction({
  handler: async (ctx, { threadId, sessionId }) => {
    // 1. Read all messages from thread
    // 2. Build summary of old messages (keep recent N)
    // 3. Delete old messages
    // 4. Insert summary as system message
    // 5. Preserve todo state and active task references
  },
})
```

**Borrowed from**: `oh-my-openagent/src/hooks/compaction-context-injector/hook.ts` (capture/inject pattern), `oh-my-openagent/src/hooks/anthropic-context-window-limit-recovery/` (truncation strategies)

### Trigger

```typescript
const usageHandler: UsageHandler = async (ctx, { userId, usage, threadId }) => {
  await ctx.runMutation(internal.tokenUsage.record, {
    sessionId, model, provider, ...usage,
  })
  // Check cumulative token count for thread
  const total = await ctx.runQuery(internal.tokenUsage.getThreadTotal, { threadId })
  if (total > COMPACTION_THRESHOLD) {
    await ctx.scheduler.runAfter(0, internal.compaction.compact, { threadId, sessionId })
  }
}
```

---

## Streaming Architecture

### Server: Delta Streaming

Every agent call uses `saveStreamDeltas: true`:

```typescript
const result = await orchestrator.streamText(
  ctx,
  { threadId },
  { promptMessageId },
  {
    saveStreamDeltas: {
      chunking: 'word',
      throttleMs: 100,
    },
  },
)
await result.consumeStream()
```

### Client: Real-Time Subscriptions

```typescript
// Query (server-side)
const listMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const paginated = await listUIMessages(ctx, components.agent, args)
    const streams = await syncStreams(ctx, components.agent, args)
    return { ...paginated, streams }
  },
})

// React (client-side)
const { results, status, loadMore } = useUIMessages(
  api.messages.listMessages,
  { threadId },
  { initialNumItems: 50, stream: true },
)
```

### Frontend Rendering

Each message rendered based on its parts:
- `type: "text"` → Markdown with `useSmoothText` animation
- `type: "reasoning"` → Collapsible thinking block
- `type: "tool"` → Tool call card (name, input, status, output)
- `type: "source"` → Cited URL card (from Gemini grounding)

---

## Frontend Structure

### Directory Layout

```
apps/agent/
├── src/
│   ├── app/
│   │   ├── layout.tsx              (AuthLayout + ConvexProvider)
│   │   ├── page.tsx                (Session list / new session)
│   │   ├── [sessionId]/
│   │   │   └── page.tsx            (Chat view with panels)
│   │   ├── settings/
│   │   │   └── page.tsx            (MCP server config)
│   │   └── login/
│   │       └── page.tsx            (Auth page)
│   ├── components/
│   │   ├── chat.tsx                (Main chat with streaming messages)
│   │   ├── message.tsx             (Single message: text, reasoning, tools)
│   │   ├── tool-call.tsx           (Tool call card with status/output)
│   │   ├── task-panel.tsx          (Background task progress panel)
│   │   ├── todo-panel.tsx          (Todo list panel)
│   │   ├── token-usage.tsx         (Token usage dashboard)
│   │   ├── mcp-config.tsx          (MCP server management UI)
│   │   └── source-card.tsx         (Cited URL from grounding search)
│   ├── schema.ts                   (App-level Zod schema imports)
│   └── proxy.ts                    (Middleware proxy)
├── e2e/                            (Playwright tests)
├── package.json
├── next.config.ts
├── tsconfig.json
├── playwright.config.ts
└── PLAN.md                         (This file)
```

### Key UI Components

**Chat View** (`[sessionId]/page.tsx`):
- Three-panel layout: Chat (center) + TaskPanel (right) + TodoPanel (right)
- Chat shows orchestrator messages with streaming
- Background task threads viewable inline or in side panel
- Token usage in footer

**Message Component** (`components/message.tsx`):
- Renders `UIMessage` from `@convex-dev/agent`
- Text parts: markdown rendering with `useSmoothText`
- Reasoning parts: collapsible "Thinking..." block with dim styling
- Tool parts: `<ToolCallCard>` with name, input JSON, status badge, output
- Source parts: clickable URL cards from Gemini grounding

**Task Panel** (`components/task-panel.tsx`):
- Lists all tasks for current session via `useQuery(api.tasks.listBySession)`
- Each task shows: description, agent, status badge, duration, progress
- Click to expand: shows sub-agent's thread messages (streaming)
- Real-time updates via Convex subscription

**Todo Panel** (`components/todo-panel.tsx`):
- Lists todos via `useQuery(api.todos.listBySession)`
- Status badges: pending (gray), in_progress (blue), completed (green), cancelled (red)
- Read-only — managed by the orchestrator

---

## Backend Structure

### New Backend Package (`packages/be-agent/`)

```
packages/be-agent/
├── convex/
│   ├── _generated/                 (Convex generated files)
│   ├── schema.ts                   (Table definitions)
│   ├── agents.ts                   (Agent definitions + actions)
│   ├── sessions.ts                 (Session CRUD)
│   ├── tasks.ts                    (Background task CRUD)
│   ├── todos.ts                    (Todo CRUD)
│   ├── messages.ts                 (Message queries for frontend)
│   ├── mcp.ts                      (MCP server management + tool calling)
│   ├── tokenUsage.ts               (Token tracking mutations/queries)
│   ├── compaction.ts               (Thread compaction logic)
│   ├── staleTaskCleanup.ts         (Cron: detect stale tasks)
│   └── convex.config.ts            (Agent component registration)
├── t.ts                            (Zod schema definitions)
├── lazy.ts                         (Factory setup)
├── prompts.ts                      (System prompts for agents)
├── package.json
└── tsconfig.json
```

### `convex.config.ts`

```typescript
import { defineApp } from 'convex/server'
import agent from '@convex-dev/agent/convex.config'

const app = defineApp()
app.use(agent)

export default app
```

---

## Execution Phases

### Phase 1: Foundation (Backend)

1. Create `packages/be-agent/` with Convex project setup
2. Define Zod schemas in `t.ts` (session owned table)
3. Define raw tables in `convex/schema.ts` (tasks, todos, mcpServers, tokenUsage)
4. Set up `lazy.ts` with `crud('session', ...)` factory
5. Register `@convex-dev/agent` component in `convex.config.ts`
6. Create basic session CRUD (`sessions.ts`)
7. Create todo CRUD (`todos.ts`)
8. Create task CRUD (`tasks.ts`)
9. Create token usage tracking (`tokenUsage.ts`)
10. Verify: `bun fix` passes, tables deploy correctly

### Phase 2: Agent Core

1. Define orchestrator agent with system prompt (`agents.ts`)
2. Define worker agent (`agents.ts`)
3. Implement `delegate` tool (spawn background sub-agent)
4. Implement `todoWrite` / `todoRead` tools
5. Implement `taskStatus` / `taskOutput` tools
6. Implement system reminder injection on task completion
7. Implement todo continuation reminder
8. Create message query for frontend (`messages.ts`)
9. Wire orchestrator action: receive message → streamText → save deltas
10. Wire worker action: receive prompt → streamText → notify on complete
11. Verify: orchestrator can respond, delegate, manage todos

### Phase 3: Search & MCP

1. Add Gemini grounding search as provider-defined tool
2. Create MCP server CRUD (`mcp.ts`)
3. Implement MCP `callTool` action with connect-use-close lifecycle
4. Implement MCP `refreshTools` action with caching
5. Create `mcpCall` tool for orchestrator/worker
6. Verify: search returns grounded results with sources, MCP tools callable

### Phase 4: Compaction & Token Tracking

1. Implement `usageHandler` for both agents
2. Create token usage recording mutation
3. Create token usage summary query
4. Implement thread compaction action
5. Add compaction trigger (threshold-based)
6. Implement stale task cleanup cron
7. Verify: token tracking accurate, compaction preserves context

### Phase 5: Frontend

1. Create `apps/agent/` Next.js app (scaffold from chat app pattern)
2. Create root layout with AuthLayout + ConvexProvider
3. Create session list page (home)
4. Create chat view page (`[sessionId]`)
5. Implement `<Chat>` component with `useUIMessages` + `useSmoothText`
6. Implement `<Message>` component (text, reasoning, tool calls, sources)
7. Implement `<ToolCallCard>` component
8. Implement `<TaskPanel>` component with sub-agent thread viewing
9. Implement `<TodoPanel>` component
10. Implement `<TokenUsage>` component
11. Implement MCP settings page
12. Verify: streaming works, tool calls visible, tasks trackable

### Phase 6: Polish & Integration

1. Add session search/filter on home page
2. Add conversation export (markdown)
3. Add tool approval flow (for dangerous MCP tools)
4. Add source panel for grounding search citations
5. E2E tests for core flows
6. Verify: `bun fix` passes, `bun test:all` passes
7. Commit, push, verify CI green

### Phase 7: Extract @noboil/agent

1. Identify generic building blocks from apps/agent
2. Move to `packages/agent/` as publishable library
3. Export: `defineAgent`, `useAgentChat`, `useTaskPanel`, `useTodoList`, `AgentChat`, `TaskPanel`, `TodoPanel`
4. Ensure apps/agent consumes from `@noboil/agent` (dogfooding)
5. Write documentation page in fumadocs

---

## oh-my-openagent Borrowed File Tracking

Every file that borrows logic or patterns from oh-my-openagent will have a tracking comment at the top:

```typescript
// @source oh-my-openagent@6625670 src/features/background-agent/types.ts
```

### Mapping

| Our File | OMO Source | What We Borrow |
|---|---|---|
| `be-agent/convex/tasks.ts` | `src/features/background-agent/types.ts` | Task status enum, progress shape |
| `be-agent/convex/agents.ts` (delegate) | `src/features/background-agent/spawner.ts` | Fire-and-forget spawn pattern |
| `be-agent/convex/agents.ts` (notify) | `src/features/background-agent/background-task-notification-template.ts` | System reminder template format |
| `be-agent/convex/todos.ts` | `src/tools/task/types.ts` | Todo schema (status, priority) |
| `be-agent/convex/compaction.ts` | `src/hooks/compaction-context-injector/hook.ts` | Capture/inject compaction pattern |
| `be-agent/convex/mcp.ts` | `src/features/skill-mcp-manager/manager.ts` | Connect-use-close MCP lifecycle |
| `be-agent/convex/staleTaskCleanup.ts` | `src/features/background-agent/task-poller.ts` | Stale task detection logic |
| `be-agent/prompts.ts` (orchestrator) | `src/agents/sisyphus.ts` | Orchestrator prompt structure |
| `be-agent/prompts.ts` (worker) | `src/agents/builtin-agents/general-agents.ts` | Worker prompt structure |
| `be-agent/convex/agents.ts` (continuation) | `src/hooks/todo-continuation-enforcer/hook.ts` | Todo continuation enforcement |

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

### Root `package.json` — Add workspace

```json
"workspaces": [
  "apps/agent",
  "apps/convex/*",
  "apps/docs",
  "apps/spacetimedb/*",
  "packages/*"
]
```

### `turbo.json` — Add env vars

```json
"globalPassThroughEnv": [
  "GOOGLE_GENERATIVE_AI_API_KEY"
]
```

---

## Success Criteria

1. User can start a session and chat with the orchestrator
2. Orchestrator can search the web via Gemini grounding (sources shown)
3. Orchestrator can delegate tasks to background workers
4. Background task progress visible in real-time in TaskPanel
5. System reminders injected when background tasks complete
6. Orchestrator can manage a todo list (visible in TodoPanel)
7. Todo continuation reminders work when todos are incomplete
8. User can configure MCP servers in settings
9. Orchestrator and workers can call MCP tools
10. Token usage tracked and displayed per session
11. Compaction triggers when context is too long
12. All agent responses stream in real-time with text animation
13. Reasoning/thinking blocks visible and collapsible
14. Tool calls rendered with input, status, and output
15. Multiple users can use the system independently
16. `bun fix` passes, CI green
