/* oxlint-disable no-underscore-dangle -- Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
/* oxlint-disable eslint(no-underscore-dangle) */
import { zid } from 'convex-helpers/server/zod4'
import { requireOrgMember } from 'noboil/convex/server'
import { api, q, uniqueCheck } from '../lazy'
import { s } from '../s'
export const { addEditor, create, editors, list, read, removeEditor, restore, rm, setEditors, update } = api.wiki
export const listDeleted = q({
  args: { orgId: zid('org') },
  handler: async (c, { orgId }: { orgId: string }) => {
    await requireOrgMember({ db: c.db, orgId, userId: c.user._id })
    const docs = await c.db
      .query('wiki')
      .filter(f => f.eq(f.field('orgId'), orgId))
      .order('desc')
      .collect()
    const deleted: typeof docs = []
    for (const d of docs) if (d.deletedAt !== undefined) deleted.push(d)
    return deleted
  }
})
export const isSlugAvailable = uniqueCheck(s.wiki, 'wiki', 'slug')
