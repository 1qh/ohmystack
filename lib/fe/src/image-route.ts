import { makeImageRoute } from '@noboil/convex/next'

import env from './env'

const { GET, POST } = await Promise.resolve(makeImageRoute({ convexUrl: env.NEXT_PUBLIC_CONVEX_URL }))

export { GET, POST }
