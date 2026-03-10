import { orgCascade } from '@noboil/convex/server'

import { orgCrud } from '../lazy'
import { orgScoped } from '../t'

// eslint-disable-next-line noboil-convex/require-rate-limit -- demo backend keeps default write throughput
export const { addEditor, create, editors, list, read, removeEditor, rm, setEditors, update } = orgCrud(
  'project',
  orgScoped.project,
  { acl: true, cascade: orgCascade(orgScoped.task, { foreignKey: 'projectId', table: 'task' }) }
)
