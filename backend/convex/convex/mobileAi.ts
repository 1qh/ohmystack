'use node'

import { generateText, tool } from 'ai'
import { v } from 'convex/values'
import { z } from 'zod/v4'

import { getModel } from '../ai'
import { api } from './_generated/api'
import { action } from './_generated/server'

const geocodeCity = async (city: string): Promise<null | { latitude: number; longitude: number }> => {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
    )
    if (!response.ok) return null
    const data = (await response.json()) as { results?: { latitude: number; longitude: number }[] },
      [result] = data.results ?? []
    return result ? { latitude: result.latitude, longitude: result.longitude } : null
  },
  getWeather = tool({
    description: 'Get the current weather at a location.',

    execute: async input => {
      let lat: number, lon: number
      if (input.city) {
        const coords = await geocodeCity(input.city)
        if (!coords) return { error: `Could not find coordinates for "${input.city}".` }
        lat = coords.latitude
        lon = coords.longitude
      } else if (input.latitude !== undefined && input.longitude !== undefined) {
        lat = input.latitude
        lon = input.longitude
      } else return { error: 'Please provide either a city name or coordinates.' }
      const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`
        ),
        weatherData = (await response.json()) as Record<string, unknown>
      if ('city' in input) weatherData.cityName = input.city
      return weatherData
    },
    inputSchema: z.object({
      city: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional()
    })
  }),
  chat = action({
    args: { chatId: v.id('chat') },
    handler: async (ctx, { chatId }) => {
      const messages = await ctx.runQuery(api.message.list, { chatId }),
        history: { content: string; role: 'assistant' | 'user' }[] = []
      for (const m of messages) {
        const textParts: string[] = []
        for (const p of m.parts) if (p.type === 'text' && p.text) textParts.push(p.text)

        history.push({
          content: textParts.join(''),
          role: m.role as 'assistant' | 'user'
        })
      }

      const model = await getModel(),
        { text } = await generateText({
          messages: history,
          model,
          system: 'You are a helpful assistant.',
          tools: { getWeather }
        })

      await ctx.runMutation(api.message.create, {
        chatId,
        parts: [{ text, type: 'text' }],
        role: 'assistant'
      })

      return { text, type: 'text' as const }
    }
  })

export { chat }
