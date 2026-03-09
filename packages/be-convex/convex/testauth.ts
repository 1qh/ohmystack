/** biome-ignore-all lint/performance/noAwaitInLoops: sequential deletes */
import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { getOrgMembership, makeOrgTestCrud, makeTestAuth } from '@ohmystack/convex/test'

import { mutation, query } from './_generated/server'

const testAuth = makeTestAuth({
    getAuthUserId: getAuthUserId as (ctx: unknown) => Promise<null | string>,
    mutation,
    query
  }),
  {
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
  } = testAuth,
  projectTestCrud = makeOrgTestCrud({
    acl: true,
    cascade: [{ foreignKey: 'projectId', table: 'task' }],
    mutation,
    query,
    table: 'project'
  }),
  taskTestCrud = makeOrgTestCrud({
    aclFrom: { field: 'projectId', table: 'project' },
    mutation,
    query,
    table: 'task'
  }),
  wikiTestCrud = makeOrgTestCrud({
    acl: true,
    mutation,
    query,
    table: 'wiki'
  }),
  {
    addEditorAsUser,
    bulkRmAsUser: bulkRmProjectAsUser,
    createAsUser: createProjectAsUser,
    listAsUser: listProjectsAsUser,
    removeEditorAsUser,
    rmAsUser: deleteProjectAsUser,
    updateAsUser: updateProjectAsUser
  } = projectTestCrud as Record<string, unknown>,
  {
    bulkRmAsUser: bulkRmTaskAsUser,
    createAsUser: createTaskAsUser,
    rmAsUser: rmTaskAsUser,
    updateAsUser: updateTaskAsUser
  } = taskTestCrud as Record<string, unknown>,
  {
    addEditorAsUser: addWikiEditorAsUser,
    createAsUser: createWikiAsUser,
    removeEditorAsUser: removeWikiEditorAsUser,
    rmAsUser: deleteWikiAsUser,
    updateAsUser: updateWikiAsUser
  } = wikiTestCrud as Record<string, unknown>,
  BATCH_SIZE = 50,
  cleanupTestData = mutation({
    args: {},
    handler: async ctx => {
      if (!isTestMode()) return { count: 0, done: true }
      const u = await ctx.db
        .query('users')
        .filter(q => q.eq(q.field('email'), TEST_EMAIL))
        .first()
      if (!u) return { count: 0, done: true }
      let count = 0
      for (const table of [
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
        'orgProfile'
      ] as const) {
        const docs = await ctx.db.query(table).take(BATCH_SIZE)
        for (const d of docs) {
          await ctx.db.delete(d._id)
          count += 1
        }
      }
      return { count, done: count < BATCH_SIZE }
    }
  }),
  toggleTaskAsUser = mutation({
    args: { id: v.id('task'), orgId: v.id('org'), userId: v.id('users') },
    handler: async (ctx, { id, orgId, userId }) => {
      if (!isTestMode()) return null
      const task = await ctx.db.get(id)
      if (!task || (task as { orgId?: unknown }).orgId !== orgId) return { code: 'NOT_FOUND' }
      const membership = await getOrgMembership(ctx.db as never, orgId, userId)
      if (!membership) return { code: 'NOT_ORG_MEMBER' }
      const isCreator = (task as { userId?: unknown }).userId === userId
      if (!(isCreator || membership.isAdmin)) {
        const pId = (task as { projectId?: string }).projectId,
          parent = pId ? await ctx.db.get(pId as never) : null,
          editors = parent ? ((parent as { editors?: string[] }).editors ?? []) : []
        if (!editors.some(eid => eid === userId)) return { code: 'FORBIDDEN' }
      }
      await ctx.db.patch(id, {
        completed: !(task as { completed?: boolean }).completed,
        updatedAt: Date.now()
      } as never)
      return ctx.db.get(id)
    }
  }),
  assignTaskAsUser = mutation({
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
  }),
  bulkUpdateTaskAsUser = mutation({
    args: {
      data: v.object({ priority: v.optional(v.string()) }),
      ids: v.array(v.id('task')),
      orgId: v.id('org'),
      userId: v.id('users')
    },
    handler: async (ctx, { data, ids, orgId, userId }) => {
      if (!isTestMode()) return null
      const membership = await getOrgMembership(ctx.db as never, orgId, userId)
      if (!membership) return { code: 'NOT_ORG_MEMBER' }
      if (!membership.isAdmin) return { code: 'INSUFFICIENT_ORG_ROLE' }
      let count = 0
      for (const id of ids) {
        const task = await ctx.db.get(id)
        if (task && (task as { orgId?: unknown }).orgId === orgId) {
          await ctx.db.patch(id, { ...data, updatedAt: Date.now() } as never)
          count += 1
        }
      }
      return { count }
    }
  }),
  getProjectEditors = query({
    args: { orgId: v.id('org'), projectId: v.id('project') },
    handler: async (ctx, { orgId, projectId }) => {
      if (!isTestMode()) return null
      const project = await ctx.db.get(projectId)
      if (!project || (project as { orgId?: unknown }).orgId !== orgId) return []
      return (project as { editors?: string[] }).editors ?? []
    }
  }),
  updateProjectAsEditorUser = updateProjectAsUser,
  toggleTaskAsEditorUser = toggleTaskAsUser

export {
  acceptInviteAsUser,
  addEditorAsUser,
  addTestOrgMember,
  addWikiEditorAsUser,
  approveJoinRequestAsUser,
  assignTaskAsUser,
  bulkRmProjectAsUser,
  bulkRmTaskAsUser,
  bulkUpdateTaskAsUser,
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
