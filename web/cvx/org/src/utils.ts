import { ConvexHttpClient } from 'convex/browser'
const getTestClient = () =>
  // biome-ignore lint/style/noProcessEnv: env validation
  new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL ?? '')
export { getTestClient }
