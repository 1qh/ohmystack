'use node'

import type { ModelMessage } from 'ai'

import { streamText } from 'ai'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'

import { getModel } from '../ai'
import { WORKER_SYSTEM_PROMPT } from '../prompts'
import { internalAction } from './_generated/server'
import { createWorkerTools } from './agents'

const markRunningRef = makeFunctionReference<'mutation', { taskId: Id<'tasks'> }, { ok: boolean }>('tasks:markRunning'),
  getByIdRef = makeFunctionReference<'query', { taskId: Id<'tasks'> }, Doc<'tasks'> | null>('tasks:getById'),
  listMessagesForPromptRef = makeFunctionReference<
    'query',
    { promptMessageId?: string; threadId: string },
    Doc<'messages'>[]
  >('orchestrator:listMessagesForPrompt'),
  createAssistantMessageRef = makeFunctionReference<
    'mutation',
    { sessionId: Id<'session'>; threadId: string },
    Id<'messages'>
  >('orchestrator:createAssistantMessage'),
  patchStreamingMessageRef = makeFunctionReference<
    'mutation',
    { messageId: Id<'messages'>; streamingContent: string },
    undefined
  >('orchestrator:patchStreamingMessage'),
  appendStepMetadataRef = makeFunctionReference<'mutation', { messageId: Id<'messages'>; stepPayload: string }, undefined>(
    'orchestrator:appendStepMetadata'
  ),
  finalizeMessageRef = makeFunctionReference<
    'mutation',
    {
      content: string
      messageId: Id<'messages'>
      parts: (
        | {
            args: string
            result?: string
            status: 'error' | 'pending' | 'success'
            toolCallId: string
            toolName: string
            type: 'tool-call'
          }
        | { snippet?: string; title: string; type: 'source'; url: string }
        | { text: string; type: 'reasoning' }
        | { text: string; type: 'text' }
      )[]
    },
    undefined
  >('orchestrator:finalizeMessage'),
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
  collectMessageText = (message: Doc<'messages'>) => {
    const parts = message.parts as {
      result?: string
      status?: string
      text?: string
      title?: string
      toolName?: string
      type: string
      url?: string
    }[]
    if (parts.length === 0) return message.content
    const chunks: string[] = []
    for (const p of parts)
      if (p.type === 'text' || p.type === 'reasoning') chunks.push(p.text ?? '')
      else if (p.type === 'tool-call') {
        const resultText = p.result ? ` result=${p.result}` : ''
        chunks.push(`[tool:${p.toolName} status=${p.status}${resultText}]`)
      } else chunks.push(`[source:${p.title} ${p.url}]`)

    const joined = chunks.join('\n')
    return joined.length > 0 ? joined : message.content
  },
  buildModelMessages = (messages: Doc<'messages'>[]) => {
    const modelMessages: ModelMessage[] = []
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    for (const m of messages)
      if (m.role === 'assistant' || m.role === 'system' || m.role === 'user')
        modelMessages.push({ content: collectMessageText(m), role: m.role })

    return modelMessages
  },
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
        const dbMessages = await ctx.runQuery(listMessagesForPromptRef, { threadId: task.threadId }),
          modelMessages = buildModelMessages(dbMessages),
          workerPrompt = task.prompt ?? task.description
        modelMessages.push({ content: workerPrompt, role: 'user' })
        const messageId = await ctx.runMutation(createAssistantMessageRef, {
            sessionId: task.sessionId,
            threadId: task.threadId
          }),
          model = await getModel(),
          tools = createWorkerTools({
            ctx,
            parentThreadId: task.parentThreadId,
            sessionId: task.sessionId
          }),
          result = streamText({
            messages: modelMessages,
            model,
            onStepFinish: async ({ text, toolCalls, toolResults, usage }) => {
              const stepPayload = JSON.stringify({ text, toolCalls, toolResults, usage })
              await ctx.runMutation(appendStepMetadataRef, {
                messageId,
                stepPayload
              })
            },
            system: WORKER_SYSTEM_PROMPT,
            temperature: 0.7,
            tools
          })
        const collectedParts: Array<
            | { text: string; type: 'text' }
            | { text: string; type: 'reasoning' }
            | {
                args: string
                result?: string
                status: 'pending' | 'success' | 'error'
                toolCallId: string
                toolName: string
                type: 'tool-call'
              }
            | { snippet?: string; title: string; type: 'source'; url: string }
          > = []
        let fullText = '',
          fullReasoning = ''
        for await (const part of result.fullStream)
          if (part.type === 'text-delta') {
            fullText += part.text
            await ctx.runMutation(patchStreamingMessageRef, {
              messageId,
              streamingContent: fullText
            })
          } else if (part.type === 'reasoning-delta') fullReasoning += part.text
          else if (part.type === 'tool-call')
            collectedParts.push({
              args: JSON.stringify(part.input),
              status: 'pending',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              type: 'tool-call'
            })
          else if (part.type === 'tool-result')
            for (const p of collectedParts)
              if (p.type === 'tool-call' && p.toolCallId === part.toolCallId) {
                p.status = 'success'
                p.result = JSON.stringify(part.output)
                if (p.toolName === 'webSearch' && typeof part.output === 'object' && part.output !== null) {
                  const resultWithSources = part.output as { sources?: Array<{ snippet?: string; title: string; url: string }> }
                  if (resultWithSources.sources)
                    for (const src of resultWithSources.sources)
                      collectedParts.push({
                        snippet: src.snippet,
                        title: src.title,
                        type: 'source',
                        url: src.url
                      })
                }
              }
        await ctx.runMutation(patchStreamingMessageRef, {
          messageId,
          streamingContent: fullText
        })
        const finalParts = [{ text: fullText, type: 'text' as const }, ...collectedParts]
        if (fullReasoning.length > 0) finalParts.splice(1, 0, { text: fullReasoning, type: 'reasoning' as const })
        await ctx.runMutation(finalizeMessageRef, {
          content: fullText,
          messageId,
          parts: finalParts
        })
        await ctx.runMutation(completeTaskRef, {
          result: fullText,
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
