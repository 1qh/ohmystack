import {
  auditLog,
  inputSanitize,
  makeFileUpload,
  makePresence,
  noboil,
  orgCascade,
  slowQueryWarn
} from '@noboil/convex/server'
import { action, internalMutation, internalQuery, mutation, query } from './convex/_generated/server'
import { getAuthUserIdOrTest } from './convex/testauth'
import { s } from './s'
const api = noboil(
  {
    action,
    getAuthUserId: getAuthUserIdOrTest,
    internalMutation,
    internalQuery,
    middleware: [auditLog(), inputSanitize(), slowQueryWarn()],
    mutation,
    orgCascadeTables: [s.task.__name, s.project.__name],
    orgSchema: s.team,
    query
  },
  ({ table }) => ({
    blog: table(s.blog, { rateLimit: 10, search: 'content' }),
    blogProfile: table(s.blogProfile),
    chat: table(s.chat, {
      cascade: [{ foreignKey: s.message.foreignKey, table: s.message.__name }],
      pub: 'isPublic',
      rateLimit: 30
    }),
    message: table(s.message, { pub: { parentField: 'isPublic' } }),
    orgProfile: table(s.orgProfile),
    project: table(s.project, {
      acl: true,
      cascade: orgCascade(s.task, { foreignKey: 'projectId' }),
      rateLimit: 30
    }),
    task: table(s.task, {
      aclFrom: { field: 'projectId', table: s.project.__name },
      rateLimit: 30
    }),
    wiki: table(s.wiki, {
      acl: true,
      rateLimit: 30,
      softDelete: true
    })
  })
)
const { cacheCrud, childCrud, crud, m, orgCrud, pq, q, singletonCrud, uniqueCheck } = api.setup
const file = makeFileUpload({
  action,
  getAuthUserId: getAuthUserIdOrTest,
  internalMutation,
  internalQuery,
  mutation,
  namespace: 'file',
  query
})
if (!api.setup.org) throw new Error('org not configured')
const orgFns = api.setup.org
const presence = makePresence({ m, q })
export { api, cacheCrud, childCrud, crud, file, m, orgCrud, orgFns, pq, presence, q, singletonCrud, uniqueCheck }
