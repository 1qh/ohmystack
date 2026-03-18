import type { output } from 'zod/v4'

import { withRetry } from '@noboil/convex/retry'
import { v } from 'convex/values'
import ky from 'ky'

import env from '../env'
import { cacheCrud } from '../lazy'
import { base } from '../t'
import { action } from './_generated/server'

type TmdbMovie = Omit<output<typeof base.movie>, 'tmdb_id'> & { id: number }

const apiKey = env.TMDB_KEY,
  // eslint-disable-next-line @typescript-eslint/promise-function-async
  tmdb = (path: string, params: Record<string, unknown>) =>
    ky.get(`https://api.themoviedb.org/3${path}`, { searchParams: { api_key: apiKey, ...params } }),
  c = cacheCrud({
    fetcher: async (_, tmdbId) => {
      const { id, ...rest } = await tmdb(`/movie/${String(tmdbId)}`, {}).json<TmdbMovie>()
      return { ...rest, tmdb_id: id }
    },
    key: 'tmdb_id',
    rateLimit: { max: 30, window: 60_000 },
    schema: base.movie,
    table: 'movie'
  })
export const search = action({
    args: { query: v.string() },
    handler: async (_, { query }) => {
      const res = await withRetry(async () => tmdb('/search/movie', { query }).json<{ results: TmdbMovie[] }>())
      return res.results.map(({ id, ...rest }) => Object.assign(rest, { tmdb_id: id }))
    }
  }),
  { all, checkRL, create, get, getInternal, invalidate, list, load, purge, read, refresh, rm, set, update } = c
