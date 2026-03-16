// biome-ignore-all lint/performance/noAwaitInLoops: x
import type { Id } from '@a/be-convex/model'
import type { UIMessage } from 'ai'

import { api } from '@a/be-convex'
import { getModel } from '@a/be-convex/ai'
import { toUIMessage } from '@a/fe/ui-message'
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server'
import { getToken, isAuthenticated } from '@noboil/convex/next'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  streamText,
  tool
} from 'ai'
import { fetchMutation, fetchQuery } from 'convex/nextjs'
import { z } from 'zod/v4'

const filterSupportedParts = (parts: Record<string, unknown>[]) =>
    parts
      .map(p => {
        if (p.type === 'text') return { text: p.text as string, type: 'text' as const }
        if (p.type === 'image') return { image: p.image as string, type: 'image' as const }
        if (p.type === 'file') return { file: p.file as string, name: p.name as string, type: 'file' as const }
        return null
      })
      .filter(Boolean) as never,
  geocodeSchema = z.object({ results: z.array(z.object({ latitude: z.number(), longitude: z.number() })).optional() }),
  weatherSchema = z.object({
    current: z.object({ temperature_2m: z.number() }).optional(),
    daily: z.object({ sunrise: z.array(z.string()), sunset: z.array(z.string()) }).optional(),
    hourly: z.object({ temperature_2m: z.array(z.number()) }).optional(),
    timezone: z.string().optional()
  }),
  geocodeCity = async (city: string): Promise<null | { latitude: number; longitude: number }> => {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
    )
    if (!response.ok) return null
    const parsed = geocodeSchema.safeParse(await response.json())
    if (!parsed.success) return null
    const [result] = parsed.data.results ?? []
    return result ? { latitude: result.latitude, longitude: result.longitude } : null
  },
  getWeather = tool({
    description: 'Get the current weather at a location. You can provide either coordinates or a city name.',
    execute: async input => {
      let lat: number, lon: number
      if (input.city) {
        const coords = await geocodeCity(input.city)
        if (!coords) return { error: `Could not find coordinates for "${input.city}". Please check the city name.` }
        lat = coords.latitude
        lon = coords.longitude
      } else if (input.latitude !== undefined && input.longitude !== undefined) {
        lat = input.latitude
        lon = input.longitude
      } else return { error: 'Please provide either a city name or both latitude and longitude coordinates.' }
      const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`
        ),
        parsed = weatherSchema.safeParse(await response.json())
      if (!parsed.success) return { error: 'Failed to parse weather data.' }
      const weatherData: Record<string, unknown> = { ...parsed.data }
      if ('city' in input) weatherData.cityName = input.city
      return weatherData
    },
    inputSchema: z.object({
      city: z.string().describe("City name (e.g., 'San Francisco', 'New York', 'London')").optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional()
    }),
    needsApproval: true
  }),
  requestSchema = z.object({
    id: z.string(),
    message: z
      .object({
        id: z.string(),
        parts: z.array(z.record(z.string(), z.unknown())),
        role: z.enum(['user', 'assistant', 'system'])
      })
      .optional(),
    messages: z
      .array(
        z.object({
          id: z.string(),
          parts: z.array(z.record(z.string(), z.unknown())),
          role: z.enum(['user', 'assistant', 'system'])
        })
      )
      .optional()
  }),
  POST = async (request: Request) => {
    if (!(await isAuthenticated())) return new Response('Unauthorized', { status: 401 })
    const token = await getToken(),
      opts = token ? { token } : {},
      json = (await request.json()) as unknown,
      parsed = requestSchema.safeParse(json)
    if (!parsed.success) return new Response('Bad request', { status: 400 })
    const { id, message, messages } = parsed.data,
      chatId = id as Id<'chat'>,
      isToolApprovalFlow = Boolean(messages)
    let chat = await fetchQuery(api.chat.read, { id: chatId }, opts)
    if (!chat && message?.role === 'user') {
      await fetchMutation(api.chat.create, { isPublic: false, title: 'New Chat' }, opts)
      chat = await fetchQuery(api.chat.read, { id: chatId }, opts)
    }
    if (!chat) return new Response('Chat not found', { status: 404 })
    let existingMessages: UIMessage[] = []
    if (!isToolApprovalFlow) {
      const dbMessages = await fetchQuery(api.message.list, { chatId }, opts)
      existingMessages = dbMessages.map(m => toUIMessage({ id: m._id, parts: m.parts, role: m.role }))
    }
    const uiMessages: UIMessage[] = isToolApprovalFlow
      ? (messages as UIMessage[])
      : message
        ? [...existingMessages, message as UIMessage]
        : existingMessages
    if (message?.role === 'user' && !isToolApprovalFlow)
      await fetchMutation(api.message.create, { chatId, parts: filterSupportedParts(message.parts), role: 'user' }, opts)
    const existingIds = new Set(uiMessages.map(m => m.id)),
      modelMessages = await convertToModelMessages(uiMessages),
      stream = createUIMessageStream({
        execute: async ({ writer: dataStream }) => {
          const result = streamText({
            experimental_activeTools: ['getWeather'],
            messages: modelMessages,
            model: await getModel(),
            system: 'You are a helpful assistant.',
            tools: { getWeather }
          })
          dataStream.merge(result.toUIMessageStream({ sendReasoning: true }))
        },
        generateId,
        onFinish: async ({ messages: finishedMessages }) => {
          if (isToolApprovalFlow)
            await Promise.all(
              finishedMessages.map(async msg => {
                const existingMsg = uiMessages.find(m => m.id === msg.id)
                if (existingMsg)
                  return fetchMutation(
                    api.message.update,
                    { id: msg.id as Id<'message'>, parts: filterSupportedParts(msg.parts) },
                    opts
                  )
                return fetchMutation(
                  api.message.create,
                  { chatId, parts: filterSupportedParts(msg.parts), role: msg.role },
                  opts
                )
              })
            )
          else if (finishedMessages.length > 0)
            await Promise.all(
              finishedMessages
                .filter(msg => msg.role === 'assistant' && !existingIds.has(msg.id))
                .map(async msg =>
                  fetchMutation(
                    api.message.create,
                    { chatId, parts: filterSupportedParts(msg.parts), role: msg.role },
                    opts
                  )
                )
            )
        },
        originalMessages: uiMessages
      })
    return createUIMessageStreamResponse({ stream })
  },
  DELETE = async (request: Request) => {
    const token = await convexAuthNextjsToken()
    if (!token) return new Response('Unauthorized', { status: 401 })
    const { searchParams } = new URL(request.url),
      id = searchParams.get('id')
    if (!id) return new Response('Bad request', { status: 400 })
    await fetchMutation(api.chat.rm, { id: id as Id<'chat'> }, { token })
    return new Response('OK', { status: 200 })
  },
  maxDuration = 60
export { DELETE, maxDuration, POST }
