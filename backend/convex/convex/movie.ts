import type { output } from 'zod/v4'
import { TMDB } from '@lorenzopant/tmdb'
import { v } from 'convex/values'
import { withRetry } from 'noboil/convex/retry'
import env from '../env'
import { cacheCrud } from '../lazy'
import { s } from '../s'
import { action } from './_generated/server'
type MovieShape = output<typeof s.movie>
const tmdb = new TMDB(env.TMDB_KEY)
const toMovie = (m: Record<string, unknown> & { id: number }): MovieShape => {
  const { id, ...rest } = m
  return { ...rest, tmdb_id: id } as MovieShape
}
const c = cacheCrud({
  fetcher: async (_, tmdbId) => toMovie(await tmdb.movies.details({ movie_id: Number(tmdbId) })),
  key: 'tmdb_id',
  rateLimit: { max: 30, window: 60_000 },
  schema: s.movie,
  table: 'movie'
})
export const search = action({
  args: { query: v.string() },
  handler: async (_, { query }) => {
    const res = await withRetry(async () => tmdb.search.movies({ query }))
    return res.results.map(toMovie)
  }
})
export const { all, checkRL, create, get, getInternal, invalidate, list, load, purge, read, refresh, rm, set, update } = c
