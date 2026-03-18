import { noboilStdb } from '@noboil/spacetimedb/server'

import { s } from '../t'

export default noboilStdb(({ t, table }) => ({
  blog: table(s.blog, { pub: 'published', rateLimit: 10 }),
  blogProfile: table(s.blogProfile),
  chat: table(s.chat, { pub: 'isPublic', rateLimit: 10 }),
  file: table.file(),
  message: table(s.message),
  movie: table(s.movie, { key: 'tmdbId' }),
  org: table(s.team, { unique: ['slug'] }),
  orgProfile: table(s.orgProfile),
  project: table(s.project, {
    extra: { editors: t.array(t.identity()).optional() }
  }),
  task: table(s.task, {
    extra: { assigneeId: t.identity().optional(), projectId: t.u32().index() }
  }),
  wiki: table(s.wiki, {
    compoundIndex: ['orgId', 'slug'],
    extra: { editors: t.array(t.identity()).optional() },
    softDelete: true
  })
}))
