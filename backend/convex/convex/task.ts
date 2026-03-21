import { getAuthUserId } from '@convex-dev/auth/server'
import { canEdit, err, requireOrgMember, requireOrgRole, time } from '@noboil/convex/server'
import { zid } from 'convex-helpers/server/zod4'
import type { Doc, Id, TableNames } from './_generated/dataModel'
import { m, orgCrud, pq } from '../lazy'
import { orgScoped } from '../t'
type OrgDoc<T extends TableNames> = Doc<T> & { orgId: Id<'org'>; userId: Id<'users'> }
const { create, list, read, rm, update } = orgCrud('task', orgScoped.task, {
    aclFrom: { field: 'projectId', table: 'project' },
    rateLimit: { max: 30, window: 60_000 }
  }),
  byProject = pq({
    args: { orgId: zid('org'), projectId: zid('project') },
    handler: async (ctx, { orgId, projectId }) => {
      if (!ctx.viewerId) return err('NOT_AUTHENTICATED')
      await requireOrgMember({ db: ctx.db, orgId, userId: ctx.viewerId })
      const tasks = await ctx.db
        .query('task')
        .withIndex('by_parent', o => o.eq('projectId' as never, projectId as never))
        .collect()
      return tasks.filter(t => (t as OrgDoc<'task'>).orgId === orgId)
    }
  }),
  toggle = m({
    args: { id: zid('task'), orgId: zid('org') },
    handler: async (ctx, { id, orgId }) => {
      await getAuthUserId(ctx as never)
      const { role } = await requireOrgMember({ db: ctx.db, orgId, userId: ctx.user._id }),
        task = (await ctx.db.get(id)) as null | OrgDoc<'task'>
      if (task?.orgId !== orgId) return err('NOT_FOUND')
      const projectId = task.projectId as Id<'project'>,
        project = projectId ? ((await ctx.db.get(projectId)) as null | OrgDoc<'project'>) : null,
        pEditors = project ? (project.editors ?? []) : []
      if (!canEdit({ acl: true, doc: { editors: pEditors, userId: task.userId }, role, userId: ctx.user._id }))
        return err('FORBIDDEN')
      await ctx.db.patch(id, { completed: !task.completed, ...time() } as never)
      return ctx.db.get(id)
    }
  }),
  assign = m({
    args: {
      assigneeId: zid('users').optional(),
      id: zid('task'),
      orgId: zid('org')
    },
    handler: async (
      ctx,
      {
        assigneeId,
        id,
        orgId
      }: {
        assigneeId?: Id<'users'>
        id: Id<'task'>
        orgId: Id<'org'>
      }
    ) => {
      await getAuthUserId(ctx as never)
      await requireOrgRole({ db: ctx.db, minRole: 'admin', orgId, userId: ctx.user._id })
      const task = (await ctx.db.get(id)) as null | OrgDoc<'task'>
      if (task?.orgId !== orgId) return err('NOT_FOUND')
      if (assigneeId) await requireOrgMember({ db: ctx.db, orgId, userId: assigneeId })
      await ctx.db.patch(id, { assigneeId: assigneeId ?? null, ...time() } as never)
      return ctx.db.get(id)
    }
  })
export { assign, byProject, create, list, read, rm, toggle, update }
