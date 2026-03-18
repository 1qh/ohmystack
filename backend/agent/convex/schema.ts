import { authTables } from '@convex-dev/auth/server'
import { ownedTable, rateLimitTable } from '@noboil/convex/server'
import { rateLimitTables } from 'convex-helpers/server/rateLimit'
import { zodOutputToConvexFields as z2c } from 'convex-helpers/server/zod4'
import { defineSchema, defineTable } from 'convex/server'

import { messageSchema, owned, taskSchema, threadRunStateSchema, todoSchema, tokenUsageSchema } from '../t'

export default defineSchema({
  ...authTables,
  ...rateLimitTable(),
  ...rateLimitTables,
  mcpServers: ownedTable(owned.mcpServer)
    .index('by_user_enabled', ['userId', 'isEnabled'])
    .index('by_user_name', ['userId', 'name']),
  messages: defineTable(z2c(messageSchema.shape)).index('by_threadId', ['threadId']),
  session: ownedTable(owned.session)
    .index('by_threadId', ['threadId'])
    .index('by_user_status', ['userId', 'status'])
    .index('by_user_threadId', ['userId', 'threadId'])
    .index('by_status', ['status']),
  tasks: defineTable(z2c(taskSchema.shape))
    .index('by_session', ['sessionId'])
    .index('by_parentThreadId_status', ['parentThreadId', 'status'])
    .index('by_threadId', ['threadId'])
    .index('by_completionReminderMessageId', ['completionReminderMessageId'])
    .index('by_status', ['status']),
  threadRunState: defineTable(z2c(threadRunStateSchema.shape))
    .index('by_threadId', ['threadId'])
    .index('by_status', ['status']),
  todos: defineTable(z2c(todoSchema.shape)).index('by_session_position', ['sessionId', 'position']),
  tokenUsage: defineTable(z2c(tokenUsageSchema.shape))
    .index('by_session', ['sessionId'])
    .index('by_threadId', ['threadId'])
})
