'use node'

import type { ModelMessage } from 'ai'

import { streamText } from 'ai'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'

import { getModel } from '../ai'
import { ORCHESTRATOR_SYSTEM_PROMPT } from '../prompts'
import { createOrchestratorTools } from './agents'
import { internalAction } from './_generated/server'

const claimRunRef = makeFunctionReference<'mutation', { runToken: string; threadId: string }, { ok: boolean }>(
    'orchestrator:claimRun'
  ),
  finishRunRef = makeFunctionReference<'mutation', { runToken: string; threadId: string }, { scheduled: boolean }>(
    'orchestrator:finishRun'
  ),
  heartbeatRunRef = makeFunctionReference<'mutation', { runToken: string; threadId: string }, undefined>(
    'orchestrator:heartbeatRun'
  ),
  recordRunErrorRef = makeFunctionReference<'mutation', { error: string; threadId: string }, undefined>(
    'orchestrator:recordRunError'
  ),
  readRunStateRef = makeFunctionReference<'query', { threadId: string }, Doc<'threadRunState'> | null>(
    'orchestrator:readRunState'
  ),
  readSessionByThreadRef = makeFunctionReference<'query', { threadId: string }, Doc<'session'> | null>(
    'orchestrator:readSessionByThread'
  ),
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
  postTurnAuditFencedRef = makeFunctionReference<
    'mutation',
    { runToken: string; threadId: string; turnRequestedInput: boolean },
    { ok: boolean; shouldContinue: boolean }
  >('orchestrator:postTurnAuditFenced'),
  incrementTaskToolCounterRef = makeFunctionReference<
    'mutation',
    { threadId: string; toolName: string },
    { shouldRemind: boolean; turnsSinceTaskTool: number }
  >('orchestrator:incrementTaskToolCounter'),
  consumeTaskReminderRef = makeFunctionReference<'mutation', { threadId: string }, { shouldInject: boolean }>(
    'orchestrator:consumeTaskReminder'
  ),
  listActiveTasksByThreadRef = makeFunctionReference<'query', { threadId: string }, Doc<'tasks'>[]>(
    'orchestrator:listActiveTasksByThread'
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
    for (const m of messages)
      if (m.role === 'assistant' || m.role === 'system' || m.role === 'user')
        modelMessages.push({ content: collectMessageText(m), role: m.role })

    return modelMessages
  },
  buildTaskReminder = ({ tasks }: { tasks: Doc<'tasks'>[] }) => {
    const lines = [
      '<system-reminder>',
      '[TASK CHECK REMINDER]',
      'Check delegated task progress with taskStatus/taskOutput before continuing.',
      ''
    ]
    for (const t of tasks) lines.push(`- [${t.status}] ${String(t._id)} ${t.description}`)
    lines.push('', 'Prioritize reviewing pending/running delegated tasks now.', '</system-reminder>')
    return lines.join('\n')
  },
  runOrchestrator = internalAction({
    args: { promptMessageId: v.optional(v.string()), runToken: v.string(), threadId: v.string() },
    handler: async (ctx, { promptMessageId, runToken, threadId }) => {
      const claimed = await ctx.runMutation(claimRunRef, { runToken, threadId })
      if (!claimed.ok) return
      const isStale = async () => {
          const state = await ctx.runQuery(readRunStateRef, { threadId })
          if (!state) return true
          if (state.status !== 'active') return true
          return state.activeRunToken !== runToken
        },
        heartbeat = setInterval(
          () => {
            ctx.runMutation(heartbeatRunRef, { runToken, threadId }).catch((_e: unknown) => _e)
          },
          2 * 60 * 1000
        )
      try {
        if (await isStale()) return
        const session = await ctx.runQuery(readSessionByThreadRef, { threadId })
        if (!session || session.status === 'archived') return
        const reminderState = await ctx.runMutation(consumeTaskReminderRef, { threadId })
        let systemPrompt = ORCHESTRATOR_SYSTEM_PROMPT
        if (reminderState.shouldInject) {
          const activeTasks = await ctx.runQuery(listActiveTasksByThreadRef, { threadId })
          if (activeTasks.length > 0)
            systemPrompt = `${ORCHESTRATOR_SYSTEM_PROMPT}\n\n${buildTaskReminder({ tasks: activeTasks })}`
        }
        const dbMessages = await ctx.runQuery(listMessagesForPromptRef, {
            promptMessageId,
            threadId
          }),
          modelMessages = buildModelMessages(dbMessages),
          messageId = await ctx.runMutation(createAssistantMessageRef, {
            sessionId: session._id,
            threadId
          }),
          model = await getModel(),
          result = streamText({
            messages: modelMessages,
            model,
            onStepFinish: async ({ text, toolCalls, toolResults, usage }) => {
              const stepPayload = JSON.stringify({ text, toolCalls, toolResults, usage })
              await ctx.runMutation(appendStepMetadataRef, {
                messageId,
                stepPayload
              })
              const toolNames: string[] = []
              for (const r of toolResults ?? []) {
                const toolName = Reflect.get(r, 'toolName')
                if (typeof toolName === 'string') toolNames.push(toolName)
              }
              await Promise.all(
                toolNames.map(toolName =>
                  ctx.runMutation(incrementTaskToolCounterRef, {
                    threadId,
                    toolName
                  })
                )
              )
            },
            system: systemPrompt,
            temperature: 0.7,
            tools: createOrchestratorTools({ ctx, parentThreadId: threadId, sessionId: session._id })
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
          flushAt = Date.now()
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            fullText += part.text
            const now = Date.now()
            if (!(now - flushAt < 400 && fullText.length % 200 !== 0)) {
              await ctx.runMutation(patchStreamingMessageRef, {
                messageId,
                streamingContent: fullText
              })
              flushAt = now
            }
          } else if (part.type === 'tool-call') {
            collectedParts.push({
              args: JSON.stringify(part.input),
              status: 'pending',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              type: 'tool-call'
            })
          } else if (part.type === 'tool-result') {
            for (const p of collectedParts) {
              // oxlint-disable-next-line eslint/max-depth
              if (p.type === 'tool-call' && p.toolCallId === part.toolCallId) {
                p.status = 'success'
                p.result = JSON.stringify(part.output)
                // oxlint-disable-next-line eslint/max-depth
                if (p.toolName === 'webSearch' && typeof part.output === 'object' && part.output !== null) {
                  const r = part.output as { sources?: Array<{ snippet?: string; title: string; url: string }> }
                  // oxlint-disable-next-line eslint/max-depth
                  if (r.sources) {
                    // oxlint-disable-next-line eslint/max-depth
                    for (const src of r.sources)
                      collectedParts.push({ snippet: src.snippet, title: src.title, type: 'source', url: src.url })
                  }
                }
              }
            }
          }
        }
        await ctx.runMutation(patchStreamingMessageRef, {
          messageId,
          streamingContent: fullText
        })
        const finalParts = [{ text: fullText, type: 'text' as const } as const, ...collectedParts]
        await ctx.runMutation(finalizeMessageRef, {
          content: fullText,
          messageId,
          parts: finalParts
        })
        if (await isStale()) return
        await ctx.runMutation(postTurnAuditFencedRef, {
          runToken,
          threadId,
          turnRequestedInput: false
        })
      } catch (error) {
        await ctx.runMutation(recordRunErrorRef, {
          error: String(error),
          threadId
        })
      } finally {
        clearInterval(heartbeat)
        await ctx.runMutation(finishRunRef, { runToken, threadId })
      }
    }
  })

export { runOrchestrator }
