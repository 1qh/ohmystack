/** biome-ignore-all lint/style/noProcessEnv: env detection */
import type { LanguageModel } from 'ai'

import { chatModel } from './models.mock'

const isTestEnvironment =
  typeof process !== 'undefined' &&
  // eslint-disable-next-line no-restricted-properties, @typescript-eslint/prefer-nullish-coalescing
  Boolean(process.env.PLAYWRIGHT || process.env.TEST_MODE || process.env.CONVEX_TEST_MODE)

let cached: LanguageModel | undefined
const getModel = async (): Promise<LanguageModel> => {
  if (cached) return cached
  if (isTestEnvironment) {
    cached = chatModel
    return cached
  }
  const { vertex } = await import('@ai-sdk/google-vertex')
  // eslint-disable-next-line require-atomic-updates
  cached = vertex('gemini-3-flash-preview') as LanguageModel
  return cached
}

export { getModel }
