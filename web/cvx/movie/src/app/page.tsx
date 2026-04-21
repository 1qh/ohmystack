/* eslint-disable @next/next/no-img-element */
/** biome-ignore-all lint/performance/noImgElement: external TMDB image URLs */
/** biome-ignore-all lint/correctness/useImageSize: external TMDB image URLs */
'use client'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@a/be-convex'
import { Input } from '@a/ui/input'
import { useAction } from 'convex/react'
import Link from 'next/link'
import { useOnlineStatus } from 'noboil/convex/react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
type SearchError = null | { message: string }
type SearchResult = FunctionReturnType<typeof api.movie.search>[number]
const TMDB_IMG = 'https://image.tmdb.org/t/p/w200'
const MovieCard = ({ movie }: { movie: SearchResult }) => (
  <div className='flex gap-3 rounded-lg border p-3' data-testid='movie-card'>
    {movie.poster_path ? (
      <img
        alt={movie.title}
        className='h-32 w-20 shrink-0 rounded-sm object-cover'
        data-testid='movie-poster'
        src={`${TMDB_IMG}${movie.poster_path}`}
      />
    ) : (
      <div className='flex h-32 w-20 shrink-0 items-center justify-center rounded-sm bg-muted text-xs text-muted-foreground'>
        No image
      </div>
    )}
    <div className='flex min-w-0 flex-1 flex-col gap-1'>
      <p className='font-medium' data-testid='movie-title'>
        {movie.title}
      </p>
      <p className='text-xs text-muted-foreground' data-testid='movie-meta'>
        {movie.release_date.slice(0, 4)} • {movie.vote_average.toFixed(1)} • ID: {movie.tmdb_id}
      </p>
      <p className='line-clamp-2 text-sm text-muted-foreground'>{movie.overview}</p>
    </div>
  </div>
)
const Page = () => {
  const isOnline = useOnlineStatus()
  const search = useAction(api.movie.search)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searchError, setSearchError] = useState<SearchError>(null)
  const [pending, go] = useTransition()
  return (
    <div className='mx-auto flex max-w-2xl flex-col gap-4 p-4' data-testid='movie-search-page'>
      <div className='flex items-center justify-between'>
        <h1 className='text-xl font-semibold'>Movie Search</h1>
        <Link className='text-sm text-muted-foreground hover:text-foreground' href='/fetch'>
          Fetch by ID →
        </Link>
      </div>
      <form
        className='flex gap-2'
        data-testid='movie-search-form'
        onSubmit={e => {
          e.preventDefault()
          if (!query.trim()) return
          go(async () => {
            try {
              setSearchError(null)
              setResults(await search({ query: query.trim() }))
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Search failed')
              setSearchError({ message: error instanceof Error ? error.message : 'Search failed' })
            }
          })
        }}>
        <Input
          data-testid='movie-search-input'
          onChange={e => setQuery(e.target.value)}
          placeholder={pending ? 'Searching...' : 'Search movies...'}
          value={query}
        />
      </form>
      {isOnline ? null : (
        <p className='rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive' data-testid='offline-banner'>
          You are offline — search requires an internet connection
        </p>
      )}
      {searchError ? (
        <p className='text-sm text-destructive' data-testid='movie-search-error'>
          {searchError.message}
        </p>
      ) : null}
      {results.length > 0 ? (
        <div data-testid='movie-results'>
          {results.map(m => (
            <MovieCard key={m.tmdb_id} movie={m} />
          ))}
        </div>
      ) : query.trim() && !pending && !searchError ? (
        <p className='text-sm text-muted-foreground' data-testid='no-results'>
          No results found
        </p>
      ) : null}
    </div>
  )
}
export default Page
