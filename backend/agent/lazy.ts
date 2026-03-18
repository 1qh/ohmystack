import { setup } from '@noboil/convex/server'

import { action, internalAction, internalMutation, internalQuery, mutation, query } from './convex/_generated/server'
import { getAuthUserIdOrTest } from './convex/testauth'

const s = setup({
    action,
    getAuthUserId: getAuthUserIdOrTest,
    internalMutation,
    internalQuery,
    mutation,
    query
  }),
  { crud, m, pq, q } = s

export { action, crud, internalAction, internalMutation, internalQuery, m, pq, q }
