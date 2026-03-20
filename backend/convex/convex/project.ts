import { orgCascade } from '@noboil/convex/server'

import { orgCrud } from '../lazy'
import { orgScoped } from '../t'
export const { addEditor, create, editors, list, read, removeEditor, rm, setEditors, update } = orgCrud(
  'project',
  orgScoped.project,
  {
    acl: true,
    cascade: orgCascade(orgScoped.task, { foreignKey: 'projectId', table: 'task' }),
    rateLimit: { max: 30, window: 60_000 }
  }
)
