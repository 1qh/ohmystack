'use node'

import { generateText } from 'ai'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'

import { getModel } from '../ai'
import { WORKER_SYSTEM_PROMPT } from '../prompts'
import { internalAction } from './_generated/server'
import { createWorkerTools } from './agents'

const markRunningRef = makeFunctionReference<'mutation', { taskId: Id<'tasks'> }, { ok: boolean }>('tasks:markRunning'),
  getByIdRef = makeFunctionReference<'query', { taskId: Id<'tasks'> }, Doc<'tasks'> | null>('tasks:getById'),
  updateTaskHeartbeatRef = makeFunctionReference<'mutation', { taskId: Id<'tasks'> }, undefined>(
    'tasks:updateTaskHeartbeat'
  ),
  completeTaskRef = makeFunctionReference<'mutation', { result: string; taskId: Id<'tasks'> }, { ok: boolean }>(
    'tasks:completeTask'
  ),
  scheduleRetryRef = makeFunctionReference<'mutation', { taskId: Id<'tasks'> }, { ok: boolean }>('tasks:scheduleRetry'),
  failTaskRef = makeFunctionReference<'mutation', { lastError: string; taskId: Id<'tasks'> }, { ok: boolean }>(
    'tasks:failTask'
  ),
  isTransientError = ({ errorMessage }: { errorMessage: string }) => {
    const lowered = errorMessage.toLowerCase(),
      transientMarkers = ['econnreset', 'etimedout', 'timeout', 'rate_limit', '429', '503', 'overloaded']
    for (const marker of transientMarkers) if (lowered.includes(marker)) return true

    return false
  },
  runWorker = internalAction({
    args: {
      prompt: v.optional(v.string()),
      taskId: v.id('tasks'),
      threadId: v.optional(v.string())
    },
    handler: async (ctx, { taskId }) => {
      const marked = await ctx.runMutation(markRunningRef, { taskId })
      if (!marked.ok) return
      const heartbeat = setInterval(() => {
        ctx.runMutation(updateTaskHeartbeatRef, { taskId }).catch((error: unknown) => error)
      }, 30_000)
      try {
        const task = await ctx.runQuery(getByIdRef, { taskId })
        if (task?.status !== 'running') return
        const model = await getModel(),
          tools = createWorkerTools({
            ctx,
            parentThreadId: task.parentThreadId,
            sessionId: task.sessionId
          }),
          result = await generateText({
            model,
            prompt: task.prompt ?? task.description,
            system: WORKER_SYSTEM_PROMPT,
            temperature: 0.5,
            tools
          }),
          output = result.text
        await ctx.runMutation(completeTaskRef, {
          result: output,
          taskId
        })
      } catch (error) {
        const task = await ctx.runQuery(getByIdRef, { taskId }),
          errorMessage = String(error),
          shouldRetry = task && task.retryCount < 3 && isTransientError({ errorMessage })
        await (shouldRetry
          ? ctx.runMutation(scheduleRetryRef, { taskId })
          : ctx.runMutation(failTaskRef, {
              lastError: errorMessage,
              taskId
            }))
      } finally {
        clearInterval(heartbeat)
      }
    }
  })

export { runWorker }
