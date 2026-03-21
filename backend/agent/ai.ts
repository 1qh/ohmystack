/** biome-ignore-all lint/style/noProcessEnv: env detection */
import type { LanguageModel } from 'ai'
// oxlint-disable-next-line import/no-unassigned-import
import './env'
import { mockModel } from './models.mock'
const isEnabled = (value: string | undefined) => value === 'true',
  isTestEnvironment =
    typeof process !== 'undefined' &&
    (isEnabled(process.env.PLAYWRIGHT) || isEnabled(process.env.TEST_MODE) || isEnabled(process.env.CONVEX_TEST_MODE))
let cached: LanguageModel | undefined, pending: Promise<LanguageModel> | undefined
const getModel = async (): Promise<LanguageModel> => {
  if (cached) return cached
  if (pending !== undefined) return pending
  if (isTestEnvironment) {
    cached = mockModel
    return mockModel
  }
  const currentPending = (async () => {
    const { createVertex } = await import('@ai-sdk/google-vertex'),
      vertex = createVertex({ apiKey: process.env.GOOGLE_VERTEX_API_KEY }),
      model = vertex('gemini-2.5-flash') as LanguageModel
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
