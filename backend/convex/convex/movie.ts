import type { output } from 'zod/v4'
import { v } from 'convex/values'
import ky from 'ky'
import { withRetry } from 'noboil/convex/retry'
import env from '../env'
import { cacheCrud } from '../lazy'
import { s } from '../s'
import { action } from './_generated/server'
type TmdbMovie = Omit<output<typeof s.movie>, 'tmdb_id'> & { id: number }
const apiKey = env.TMDB_KEY
const tmdb = async (path: string, params: Record<string, unknown>) =>
  ky.get(`https://api.themoviedb.org/3${path}`, { searchParams: { api_key: apiKey, ...params } })
const c = cacheCrud({
  fetcher: async (_, tmdbId) => {
    const res = await tmdb(`/movie/${String(tmdbId)}`, {})
    const { id, ...rest } = await res.json<TmdbMovie>()
    return { ...rest, tmdb_id: id }
  },
  key: 'tmdb_id',
  rateLimit: { max: 30, window: 60_000 },
  schema: s.movie,
  table: 'movie'
})
export const search = action({
  args: { query: v.string() },
  handler: async (_, { query }) => {
    const res = await withRetry(async () => {
      const r = await tmdb('/search/movie', { query })
      return r.json<{ results: TmdbMovie[] }>()
    })
    return res.results.map(({ id, ...rest }: TmdbMovie) => Object.assign(rest, { tmdb_id: id }))
  }
})
export const { all, checkRL, create, get, getInternal, invalidate, list, load, purge, read, refresh, rm, set, update } = c
