import type { api } from '@a/be-convex'
import type { FunctionReturnType } from 'convex/server'

type Movie = FunctionReturnType<typeof api.movie.load>

export type { Movie }
