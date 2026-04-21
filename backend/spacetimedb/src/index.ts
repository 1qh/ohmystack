/* eslint-disable @typescript-eslint/naming-convention */
import { noboil } from 'noboil/spacetimedb/server'
import { s } from '../s'
const spacetimedb = noboil({
  tables: ({ t, table }) => ({
    blog: table(s.blog, { pub: 'published', rateLimit: 10 }),
    blogProfile: table(s.blogProfile),
    chat: table(s.chat, { pub: 'isPublic', rateLimit: 10 }),
    file: table.file(),
    message: table(s.message),
    movie: table(s.movie, { key: 'tmdbId' }),
    org: table(s.team, { unique: ['slug'] }),
    orgProfile: table(s.orgProfile),
    project: table(s.project, {
      cascade: { foreignKey: 'projectId', table: s.task.__name },
      extra: { editors: t.array(t.identity()).optional() }
    }),
    task: table(s.task, {
      extra: { assigneeId: t.identity().optional() }
    }),
    wiki: table(s.wiki, {
      compoundIndex: ['orgId', 'slug'],
      extra: { editors: t.array(t.identity()).optional() },
      softDelete: true
    })
  })
})
type DbLike = Record<string, TableLike>
interface TableLike {
  delete: (row: unknown) => void
  iter: () => Iterable<unknown>
}
export const cleanup_test_data = (
  spacetimedb as unknown as { reducer: (o: { name: string }, f: (c: { db: DbLike }) => void) => unknown }
).reducer({ name: 'cleanup_test_data' }, ctx => {
  for (const name of ['blog', 'blogProfile', 'blog_profile']) {
    const tbl = ctx.db[name]
    if (tbl) for (const row of tbl.iter()) tbl.delete(row)
  }
})
export default spacetimedb
