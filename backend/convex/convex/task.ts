import { zid } from 'convex-helpers/server/zod4'
import { canEdit, err, requireOrgMember, requireOrgRole, time } from 'noboil/convex/server'
import { api, m, pq } from '../lazy'
const { create, list, read, rm, update } = api.task
const byProject = pq({
  args: { orgId: zid('org'), projectId: zid('project') },
  handler: async (ctx, { orgId, projectId }) => {
    if (!ctx.viewerId) return err('NOT_AUTHENTICATED')
    await requireOrgMember({ db: ctx.db, orgId, userId: ctx.viewerId })
    const tasks = await ctx.db
      .query('task')
      .withIndex('by_parent', o => o.eq('projectId', projectId as never))
      .collect()
    return tasks.filter(t => t.orgId === orgId)
  }
})
const toggle = m({
  args: { id: zid('task'), orgId: zid('org') },
  handler: async (ctx, { id, orgId }) => {
    const { role } = await requireOrgMember({ db: ctx.db, orgId, userId: ctx.user._id })
    const task = await ctx.db.get(id)
    if (task?.orgId !== orgId) return err('NOT_FOUND')
    const { projectId } = task
    const project = projectId ? await ctx.db.get(projectId) : null
    const pEditors = project?.editors ?? []
    if (!canEdit({ acl: true, doc: { editors: pEditors, userId: task.userId }, role, userId: ctx.user._id }))
      return err('FORBIDDEN')
    await ctx.db.patch(id, { completed: !task.completed, ...time() })
    return ctx.db.get(id)
  }
})
const assign = m({
  args: {
    assigneeId: zid('users').optional(),
    id: zid('task'),
    orgId: zid('org')
  },
  handler: async (ctx, { assigneeId, id, orgId }) => {
    await requireOrgRole({ db: ctx.db, minRole: 'admin', orgId, userId: ctx.user._id })
    const task = await ctx.db.get(id)
    if (task?.orgId !== orgId) return err('NOT_FOUND')
    if (assigneeId) await requireOrgMember({ db: ctx.db, orgId, userId: assigneeId })
    await ctx.db.patch(id, { assigneeId: assigneeId ?? null, ...time() })
    return ctx.db.get(id)
  }
})
export { assign, byProject, create, list, read, rm, toggle, update }
