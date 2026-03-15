/** biome-ignore-all lint/style/noProcessEnv: env detection */
import { describe, expect, test } from 'bun:test'

describe('production model smoke', () => {
  test(
    'Vertex API generates text with real credentials',
    async () => {
      const { createVertex } = await import('@ai-sdk/google-vertex')
      const apiKey = process.env.GOOGLE_VERTEX_API_KEY
      expect(apiKey).toBeDefined()
      const vertex = createVertex({ apiKey })
      const model = vertex('gemini-2.0-flash')
      const { generateText } = await import('ai')
      const result = await generateText({
        maxTokens: 20,
        model,
        prompt: 'Say hello in exactly 3 words'
      })
      expect(result.text.length).toBeGreaterThan(0)
      expect(result.usage.totalTokens).toBeGreaterThan(0)
    },
    30_000
  )
})
