import { requireOrgMember } from '@ohmystack/convex/server'
import { zid } from 'convex-helpers/server/zod4'

import { orgCrud, q, uniqueCheck } from '../lazy'
import { orgScoped } from '../t'

export const {
    addEditor,
    bulkRm,
    bulkUpdate,
    create,
    editors,
    list,
    read,
    removeEditor,
    restore,
    rm,
    setEditors,
    update
    // eslint-disable-next-line ohmystack-convex/require-rate-limit -- demo backend keeps default write throughput
  } = orgCrud('wiki', orgScoped.wiki, { acl: true, softDelete: true }),
  listDeleted = q({
    args: { orgId: zid('org') },
    handler: async (c, { orgId }: { orgId: string }) => {
      await requireOrgMember({ db: c.db, orgId, userId: c.user._id })
      const docs = await c.db
          .query('wiki')
          .filter(f => f.eq(f.field('orgId'), orgId))
          .order('desc')
          .collect(),
        deleted: typeof docs = []
      for (const d of docs) if (d.deletedAt !== undefined) deleted.push(d)
      return deleted
    }
  }),
  isSlugAvailable = uniqueCheck(orgScoped.wiki, 'wiki', 'slug')
