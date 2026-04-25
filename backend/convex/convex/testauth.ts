/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-condition */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential deletes */
import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { getOrgMembership, makeOrgTestCrud, makeTestAuth } from 'noboil/convex/test'
import { mutation, query } from './_generated/server'
const testAuth = makeTestAuth({
  getAuthUserId: getAuthUserId as (ctx: unknown) => Promise<null | string>,
  mutation,
  query
})
const {
  acceptInviteAsUser,
  addTestOrgMember,
  approveJoinRequestAsUser,
  cancelJoinRequestAsUser,
  cleanupOrgTestData,
  cleanupTestUsers,
  createExpiredInvite,
  createTestUser,
  deleteOrgAsUser,
  ensureTestUser,
  getAuthUserIdOrTest,
  getJoinRequest,
  getTestUser,
  getTestUserByEmail,
  inviteAsUser,
  isTestMode,
  leaveOrgAsUser,
  pendingInvitesAsUser,
  pendingJoinRequestsAsUser,
  rejectJoinRequestAsUser,
  removeMemberAsUser,
  removeTestOrgMember,
  requestJoinAsUser,
  setAdminAsUser,
  TEST_EMAIL,
  transferOwnershipAsUser,
  updateOrgAsUser
} = testAuth
const projectTestCrud = makeOrgTestCrud({
  acl: true,
  cascade: [{ foreignKey: 'projectId', table: 'task' }],
  mutation,
  query,
  table: 'project'
})
const taskTestCrud = makeOrgTestCrud({
  aclFrom: { field: 'projectId', table: 'project' },
  mutation,
  query,
  table: 'task'
})
const wikiTestCrud = makeOrgTestCrud({
  acl: true,
  mutation,
  query,
  table: 'wiki'
})
const {
  addEditorAsUser,
  createAsUser: createProjectAsUser,
  listAsUser: listProjectsAsUser,
  removeEditorAsUser,
  rmAsUser: deleteProjectAsUser,
  updateAsUser: updateProjectAsUser
} = projectTestCrud
const { createAsUser: createTaskAsUser, rmAsUser: rmTaskAsUser, updateAsUser: updateTaskAsUser } = taskTestCrud
const {
  addEditorAsUser: addWikiEditorAsUser,
  createAsUser: createWikiAsUser,
  removeEditorAsUser: removeWikiEditorAsUser,
  rmAsUser: deleteWikiAsUser,
  updateAsUser: updateWikiAsUser
} = wikiTestCrud
const BATCH_SIZE = 50
const cleanupTestData = mutation({
  args: {},
  handler: async ctx => {
    if (!isTestMode()) return { count: 0, done: true }
    if (
      !ctx.db
        .query('users')
        .filter(q => q.eq(q.field('email'), TEST_EMAIL))
        .first()
    )
      return { count: 0, done: true }
    let count = 0
    const tables = [
      'task',
      'wiki',
      'project',
      'orgInvite',
      'orgMember',
      'org',
      'message',
      'chat',
      'blog',
      'blogProfile',
      'orgProfile',
      'pollProfile',
      'vote',
      'poll',
      'siteConfig',
      'pollVoteQuota'
    ] as const
    const tableDocs = await Promise.all(
      tables.map(async table => {
        const docs = await ctx.db.query(table).take(BATCH_SIZE)
        await Promise.all(docs.map(async d => ctx.db.delete(d._id)))
        return docs.length
      })
    )
    for (const removedCount of tableDocs) count += removedCount
    return { count, done: count < BATCH_SIZE }
  }
})
const toggleTaskAsUser = mutation({
  args: { id: v.id('task'), orgId: v.id('org'), userId: v.id('users') },
  handler: async (ctx, { id, orgId, userId }) => {
    if (!isTestMode()) return null
    const task = await ctx.db.get(id)
    if (!task || (task as { orgId?: unknown }).orgId !== orgId) return { code: 'NOT_FOUND' }
    const membership = await getOrgMembership(ctx.db as never, orgId, userId)
    if (!membership) return { code: 'NOT_ORG_MEMBER' }
    const isCreator = (task as { userId?: unknown }).userId === userId
    if (!(isCreator || membership.isAdmin)) {
      const pId = (task as { projectId?: string }).projectId
      const parent = pId ? await ctx.db.get(pId as never) : null
      const editors = parent ? ((parent as { editors?: string[] }).editors ?? []) : []
      if (!editors.some(eid => eid === userId)) return { code: 'FORBIDDEN' }
    }
    await ctx.db.patch(id, {
      completed: !(task as { completed?: boolean }).completed,
      updatedAt: Date.now()
    } as never)
    return ctx.db.get(id)
  }
})
const assignTaskAsUser = mutation({
  args: {
    assigneeId: v.optional(v.id('users')),
    id: v.id('task'),
    orgId: v.id('org'),
    userId: v.id('users')
  },
  handler: async (ctx, { assigneeId, id, orgId, userId }) => {
    if (!isTestMode()) return null
    const task = await ctx.db.get(id)
    if (!task || (task as { orgId?: unknown }).orgId !== orgId) return { code: 'NOT_FOUND' }
    const membership = await getOrgMembership(ctx.db as never, orgId, userId)
    if (!membership) return { code: 'NOT_ORG_MEMBER' }
    if (!membership.isAdmin) return { code: 'INSUFFICIENT_ORG_ROLE' }
    await ctx.db.patch(id, {
      assigneeId: assigneeId ?? null,
      updatedAt: Date.now()
    } as never)
    return ctx.db.get(id)
  }
})
const getProjectEditors = query({
  args: { orgId: v.id('org'), projectId: v.id('project') },
  handler: async (ctx, { orgId, projectId }) => {
    if (!isTestMode()) return null
    const project = await ctx.db.get(projectId)
    if (!project || (project as { orgId?: unknown }).orgId !== orgId) return []
    return (project as { editors?: string[] }).editors ?? []
  }
})
const updateProjectAsEditorUser = updateProjectAsUser
const toggleTaskAsEditorUser = toggleTaskAsUser
export {
  acceptInviteAsUser,
  addEditorAsUser,
  addTestOrgMember,
  addWikiEditorAsUser,
  approveJoinRequestAsUser,
  assignTaskAsUser,
  cancelJoinRequestAsUser,
  cleanupOrgTestData,
  cleanupTestData,
  cleanupTestUsers,
  createExpiredInvite,
  createProjectAsUser,
  createTaskAsUser,
  createTestUser,
  createWikiAsUser,
  deleteOrgAsUser,
  deleteProjectAsUser,
  deleteWikiAsUser,
  ensureTestUser,
  getAuthUserIdOrTest,
  getJoinRequest,
  getProjectEditors,
  getTestUser,
  getTestUserByEmail,
  inviteAsUser,
  isTestMode,
  leaveOrgAsUser,
  listProjectsAsUser,
  pendingInvitesAsUser,
  pendingJoinRequestsAsUser,
  rejectJoinRequestAsUser,
  removeEditorAsUser,
  removeMemberAsUser,
  removeTestOrgMember,
  removeWikiEditorAsUser,
  requestJoinAsUser,
  rmTaskAsUser,
  setAdminAsUser,
  TEST_EMAIL,
  toggleTaskAsEditorUser,
  toggleTaskAsUser,
  transferOwnershipAsUser,
  updateOrgAsUser,
  updateProjectAsEditorUser,
  updateProjectAsUser,
  updateTaskAsUser,
  updateWikiAsUser
}
