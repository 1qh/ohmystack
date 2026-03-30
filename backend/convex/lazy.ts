import { auditLog, inputSanitize, makeFileUpload, makePresence, setup, slowQueryWarn } from '@noboil/convex/server'
import { action, internalMutation, internalQuery, mutation, query } from './convex/_generated/server'
import { getAuthUserIdOrTest } from './convex/testauth'
import { org } from './t'
const s = setup({
    action,
    getAuthUserId: getAuthUserIdOrTest,
    internalMutation,
    internalQuery,
    middleware: [auditLog(), inputSanitize(), slowQueryWarn()],
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
const orgFns = s.org,
  presence = makePresence({ m, q })
export { cacheCrud, childCrud, crud, file, m, orgCrud, orgFns, pq, presence, q, singletonCrud, uniqueCheck }
