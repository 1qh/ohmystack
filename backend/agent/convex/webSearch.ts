/** biome-ignore-all lint/style/noProcessEnv: test mode detection */
'use node'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { internalAction } from './_generated/server'
interface GroundedSource {
  snippet: string
  title: string
  url: string
}
interface GroundingResult {
  sources: GroundedSource[]
  summary: string
}
const recordModelUsageRef = makeFunctionReference<
    'mutation',
    {
      agentName: string
      inputTokens: number
      model: string
      outputTokens: number
      provider: string
      threadId: string
      totalTokens: number
    },
    null | string
  >('tokenUsage:recordModelUsage'),
  normalizeGrounding = ({ result }: { result: GroundingResult }): GroundingResult => ({
    sources: result.sources,
    summary: result.summary
  }),
  groundWithGemini = internalAction({
    args: { query: v.string(), threadId: v.string() },
    handler: async (ctx, { query, threadId }) => {
      const isTestMode = process.env.CONVEX_TEST_MODE === 'true',
        mock = normalizeGrounding({
          result: {
            sources: [
              {
                snippet: 'Test snippet',
                title: 'Test Source',
                url: 'https://example.com'
              }
            ],
            summary: `Mock search result for: ${query}`
          }
        })
      if (!isTestMode) throw new Error('search_not_implemented')
      const inputTokens = query.length,
        outputTokens = mock.summary.length
      await ctx.runMutation(recordModelUsageRef, {
        agentName: 'search-bridge',
        inputTokens,
        model: 'mock-model',
        outputTokens,
        provider: 'mock',
        threadId,
        totalTokens: inputTokens + outputTokens
      })
      return mock
    }
  })
export { groundWithGemini, normalizeGrounding }
