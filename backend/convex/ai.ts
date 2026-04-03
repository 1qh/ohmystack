/** biome-ignore-all lint/style/noProcessEnv: env detection */
import type { LanguageModel } from 'ai'
import { chatModel } from './models.mock'
const isEnabled = (value: string | undefined) => value === 'true'
const runtimeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
const isTestEnvironment =
  isEnabled(runtimeEnv?.PLAYWRIGHT) || isEnabled(runtimeEnv?.TEST_MODE) || isEnabled(runtimeEnv?.CONVEX_TEST_MODE)
let cached: LanguageModel | undefined
let pending: Promise<LanguageModel> | undefined
const getModel = async (): Promise<LanguageModel> => {
  if (cached) return cached
  if (pending !== undefined) return pending
  if (isTestEnvironment) {
    cached = chatModel
    return cached
  }
  const currentPending = (async () => {
    const { vertex } = await import('@ai-sdk/google-vertex')
    const model = vertex('gemini-3-flash-preview') as LanguageModel
    cached = model
    return model
  })()
  pending = currentPending
  try {
    return await currentPending
  } finally {
    if (pending === currentPending) pending = undefined
  }
}
export { getModel }
