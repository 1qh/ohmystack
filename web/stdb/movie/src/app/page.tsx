/* eslint-disable @next/next/no-img-element */
/* oxlint-disable @next/next/no-img-element */
// biome-ignore-all lint/performance/noImgElement: x
// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
// biome-ignore-all lint/correctness/useImageSize: dynamic images
'use client'
import { Input } from '@a/ui/input'
import { useErrorToast, useOnlineStatus } from '@noboil/spacetimedb/react'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
interface SearchResult {
  id: number
  overview: string
  poster_path: null | string
  release_date: string
  title: string
  tmdb_id: number
  vote_average: number
}
interface TmdbSearchResponse {
  results: SearchResult[]
}
const TMDB_IMG = 'https://image.tmdb.org/t/p/w200',
  PLAYWRIGHT_MOVIES: SearchResult[] = [
    {
      id: 27_205,
      overview: 'A thief steals information by infiltrating dreams.',
      poster_path: '/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
      release_date: '2010-07-16',
      title: 'Inception',
      tmdb_id: 27_205,
      vote_average: 8.4
    },
    {
      id: 550,
      overview: 'An insomniac office worker crosses paths with a soap maker.',
      poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
      release_date: '1999-10-15',
      title: 'Fight Club',
      tmdb_id: 550,
      vote_average: 8.4
    },
    {
      id: 268,
      overview: 'Batman faces his fear in a city consumed by crime.',
      poster_path: '/iA5qZ0v8Yk4wG6K0Ff5mX2lQmR9.jpg',
      release_date: '1989-06-23',
      title: 'Batman',
      tmdb_id: 268,
      vote_average: 7.2
    },
    {
      id: 364,
      overview: 'Batman Returns to Gotham to stop a new menace.',
      poster_path: '/jKBjeXM7iBBV9UkUcOXx3m7FSHY.jpg',
      release_date: '1992-06-19',
      title: 'Batman Returns',
      tmdb_id: 364,
      vote_average: 6.9
    }
  ],
  searchMovies = async (query: string) => {
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY
    if (!apiKey) {
      if (process.env.NEXT_PUBLIC_PLAYWRIGHT === '1') {
        const q = query.toLowerCase(),
          rows: SearchResult[] = []
        for (const m of PLAYWRIGHT_MOVIES) if (m.title.toLowerCase().includes(q)) rows.push(m)
        return rows
      }
      throw new Error('Missing NEXT_PUBLIC_TMDB_API_KEY')
    }
    const url = new URL('https://api.themoviedb.org/3/search/movie')
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('query', query)
    const response = await fetch(url)
    if (!response.ok) throw new Error('Search failed')
    const payload = (await response.json()) as TmdbSearchResponse,
      rows: SearchResult[] = []
    for (const m of payload.results)
      rows.push({
        id: m.id,
        overview: m.overview,
        poster_path: m.poster_path,
        release_date: m.release_date,
        title: m.title,
        tmdb_id: m.id,
        vote_average: m.vote_average
      })
    return rows
  },
  MovieCard = ({ movie }: { movie: SearchResult }) => (
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
  ),
  Page = () => {
    const isOnline = useOnlineStatus(),
      handleError = useErrorToast({
        toast: (msg: string) => {
          toast.error(msg)
        }
      }),
      [query, setQuery] = useState(''),
      [results, setResults] = useState<SearchResult[]>([]),
      [searchError, setSearchError] = useState<null | { message: string }>(null),
      [pending, go] = useTransition()
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
                setResults(await searchMovies(query.trim()))
              } catch (error) {
                setResults([])
                setSearchError({ message: error instanceof Error ? error.message : 'Search failed' })
                handleError(error)
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
        {searchError ? (
          <p className='text-sm text-destructive' data-testid='movie-search-error'>
            {searchError.message}
          </p>
        ) : null}
        {isOnline ? null : (
          <p className='rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive' data-testid='offline-banner'>
            You are offline — search requires an internet connection
          </p>
        )}
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
