import { makeOwned } from '@noboil/convex/schema'
import { zid } from 'convex-helpers/server/zod4'
import { array, boolean, number, object, string, union, enum as zenum } from 'zod/v4'
const messagePart = union([
    object({ text: string(), type: zenum(['text']) }),
    object({ text: string(), type: zenum(['reasoning']) }),
    object({
      args: string(),
      result: string().optional(),
      status: zenum(['pending', 'success', 'error']),
      toolCallId: string(),
      toolName: string(),
      type: zenum(['tool-call'])
    }),
    object({
      snippet: string().optional(),
      title: string(),
      type: zenum(['source']),
      url: string()
    })
  ]),
  owned = makeOwned({
    mcpServer: object({
      authHeaders: string().optional(),
      cachedAt: number().optional(),
      cachedTools: string().optional(),
      isEnabled: boolean(),
      name: string().min(1),
      transport: zenum(['http']),
      url: string().min(1)
    }),
    session: object({
      archivedAt: number().optional(),
      lastActivityAt: number(),
      status: zenum(['active', 'idle', 'archived']),
      threadId: string(),
      title: string().optional()
    })
  }),
  messageSchema = object({
    content: string(),
    isComplete: boolean(),
    metadata: string().optional(),
    parts: array(messagePart),
    role: zenum(['user', 'assistant', 'system']),
    sessionId: zid('session').optional(),
    streamingContent: string().optional(),
    threadId: string()
  }),
  taskSchema = object({
    completedAt: number().optional(),
    completionNotifiedAt: number().optional(),
    completionReminderMessageId: string().optional(),
    continuationEnqueuedAt: number().optional(),
    description: string(),
    heartbeatAt: number().optional(),
    isBackground: boolean(),
    lastError: string().optional(),
    parentThreadId: string(),
    pendingAt: number().optional(),
    prompt: string().optional(),
    result: string().optional(),
    retryCount: number(),
    sessionId: zid('session'),
    startedAt: number().optional(),
    status: zenum(['pending', 'running', 'completed', 'failed', 'timed_out', 'cancelled']),
    threadId: string()
  }),
  todoSchema = object({
    content: string(),
    position: number(),
    priority: zenum(['low', 'medium', 'high']),
    sessionId: zid('session'),
    status: zenum(['pending', 'in_progress', 'completed', 'cancelled'])
  }),
  tokenUsageSchema = object({
    agentName: string(),
    inputTokens: number(),
    model: string(),
    outputTokens: number(),
    provider: string(),
    sessionId: zid('session'),
    threadId: string(),
    totalTokens: number()
  }),
  threadRunStateSchema = object({
    activatedAt: number().optional(),
    activeRunToken: string().optional(),
    autoContinueStreak: number(),
    claimedAt: number().optional(),
    compactionLock: string().optional(),
    compactionLockAt: number().optional(),
    compactionSummary: string().optional(),
    consecutiveFailures: number().optional(),
    lastCompactedMessageId: string().optional(),
    lastContinuationAt: number().optional(),
    lastError: string().optional(),
    lastTodoSnapshot: string().optional(),
    queuedPriority: zenum(['user_message', 'task_completion', 'todo_continuation']).optional(),
    queuedPromptMessageId: string().optional(),
    queuedReason: string().optional(),
    runClaimed: boolean().optional(),
    runHeartbeatAt: number().optional(),
    stagnationCount: number().optional(),
    status: zenum(['idle', 'active']),
    threadId: string(),
    turnsSinceTaskTool: number().optional()
  })
export { messageSchema, owned, taskSchema, threadRunStateSchema, todoSchema, tokenUsageSchema }
