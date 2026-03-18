import { makeFileUpload, setup } from '@noboil/convex/server'

import { action, internalMutation, internalQuery, mutation, query } from './convex/_generated/server'
import { getAuthUserIdOrTest } from './convex/testauth'
import { org } from './t'

const s = setup({
    action,
    getAuthUserId: getAuthUserIdOrTest,
    internalMutation,
    internalQuery,
    mutation,
    orgCascadeTables: ['task', 'project'],
    orgSchema: org.team,
    query
  }),
  { cacheCrud, childCrud, crud, m, orgCrud, pq, q, singletonCrud, uniqueCheck } = s,
  file = makeFileUpload({
    action,
    getAuthUserId: getAuthUserIdOrTest,
    internalMutation,
    internalQuery,
    mutation,
    namespace: 'file',
    query
  })

if (!s.org) throw new Error('org not configured')
const orgFns = s.org

export { cacheCrud, childCrud, crud, file, m, orgCrud, orgFns, pq, q, singletonCrud, uniqueCheck }
