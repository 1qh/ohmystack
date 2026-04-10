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
import { s } from './t'
const api = noboil(
  {
    action,
    getAuthUserId: getAuthUserIdOrTest,
    internalMutation,
    internalQuery,
    middleware: [auditLog(), inputSanitize(), slowQueryWarn()],
    mutation,
    orgCascadeTables: ['task', 'project'],
    orgSchema: s.team,
    query
  },
  ({ table }) => ({
    blog: table(s.blog, { rateLimit: { max: 10, window: 60_000 }, search: 'content' }),
    blogProfile: table(s.blogProfile),
    chat: table(s.chat, {
      cascade: [{ foreignKey: 'chatId', table: 'message' }],
      pub: { where: { isPublic: true } },
      rateLimit: { max: 30, window: 60_000 }
    }),
    message: table(s.message, { pub: { parentField: 'isPublic' } }),
    orgProfile: table(s.orgProfile),
    project: table(s.project, {
      acl: true,
      cascade: orgCascade(s.task, { foreignKey: 'projectId', table: 'task' }),
      rateLimit: { max: 30, window: 60_000 }
    }),
    task: table(s.task, {
      aclFrom: { field: 'projectId', table: 'project' },
      rateLimit: { max: 30, window: 60_000 }
    }),
    wiki: table(s.wiki, {
      acl: true,
      rateLimit: { max: 30, window: 60_000 },
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
