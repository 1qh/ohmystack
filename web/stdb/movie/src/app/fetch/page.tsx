/* eslint-disable @next/next/no-img-element */
/* oxlint-disable @next/next/no-img-element */
// biome-ignore-all lint/correctness/useImageSize: x
// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
// biome-ignore-all lint/performance/noImgElement: external images
'use client'
import type { s } from '@a/be-spacetimedb/t'
import type { InferCreate } from '@noboil/spacetimedb'
import { reducers } from '@a/be-spacetimedb/spacetimedb'
import { Badge } from '@a/ui/badge'
import { Input } from '@a/ui/input'
import { Skeleton } from '@a/ui/skeleton'
import { useMut } from '@noboil/spacetimedb/react'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition } from 'react'
const TMDB_IMG = 'https://image.tmdb.org/t/p/w300',
  TMDB_BACKDROP = 'https://image.tmdb.org/t/p/w780',
  PLAYWRIGHT_MOVIES = new Map<number, MovieDetailData>([
    [
      155,
      {
        backdropPath: '/hqkIcbrOHL86UncnHIsHVcVmzue.jpg',
        budget: 185_000_000,
        genres: [
          { id: 28, name: 'Action' },
          { id: 80, name: 'Crime' }
        ],
        originalTitle: 'The Dark Knight',
        overview: 'Batman raises the stakes in his war on crime.',
        posterPath: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
        releaseDate: '2008-07-18',
        revenue: 1_006_000_000,
        runtime: 152,
        tagline: 'Why so serious?',
        title: 'The Dark Knight',
        tmdbId: 155,
        voteAverage: 8.5,
        voteCount: 33_000
      }
    ],
    [
      550,
      {
        backdropPath: '/fCayJrkfRaCRCTh8GqN30f8oyQF.jpg',
        budget: 63_000_000,
        genres: [
          { id: 18, name: 'Drama' },
          { id: 53, name: 'Thriller' }
        ],
        originalTitle: 'Fight Club',
        overview: 'An insomniac office worker crosses paths with a soap maker.',
        posterPath: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
        releaseDate: '1999-10-15',
        revenue: 101_200_000,
        runtime: 139,
        tagline: 'Mischief. Mayhem. Soap.',
        title: 'Fight Club',
        tmdbId: 550,
        voteAverage: 8.4,
        voteCount: 28_000
      }
    ],
    [
      680,
      {
        backdropPath: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
        budget: 8_000_000,
        genres: [
          { id: 80, name: 'Crime' },
          { id: 53, name: 'Thriller' }
        ],
        originalTitle: 'Pulp Fiction',
        overview: 'The lives of two mob hitmen intertwine in Los Angeles.',
        posterPath: '/vQWk5YBFWF4bZaofAbv0tShwBvQ.jpg',
        releaseDate: '1994-09-10',
        revenue: 213_900_000,
        runtime: 154,
        tagline: 'Just because you are a character does not mean you have character.',
        title: 'Pulp Fiction',
        tmdbId: 680,
        voteAverage: 8.5,
        voteCount: 30_000
      }
    ],
    [
      27_205,
      {
        backdropPath: '/s3TBrRGB1iav7gFOCNx3H31MoES.jpg',
        budget: 160_000_000,
        genres: [
          { id: 28, name: 'Action' },
          { id: 878, name: 'Science Fiction' }
        ],
        originalTitle: 'Inception',
        overview: 'A thief steals information by infiltrating dreams.',
        posterPath: '/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
        releaseDate: '2010-07-16',
        revenue: 836_800_000,
        runtime: 148,
        tagline: 'Your mind is the scene of the crime.',
        title: 'Inception',
        tmdbId: 27_205,
        voteAverage: 8.4,
        voteCount: 37_000
      }
    ]
  ]),
  formatMoney = (n: number | undefined) => (n ? `$${(n / 1_000_000).toFixed(1)}M` : 'N/A')
type MovieDetailData = InferCreate<typeof s.movie>
interface TmdbMovieResponse {
  backdrop_path: null | string
  budget: number
  genres: { id: number; name: string }[]
  id: number
  original_title: string
  overview: string
  poster_path: null | string
  release_date: string
  revenue: number
  runtime: null | number
  tagline: string
  title: string
  vote_average: number
  vote_count: number
}
const fetchMovie = async (id: number): Promise<MovieDetailData> => {
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY
    if (!apiKey) {
      if (process.env.NEXT_PUBLIC_PLAYWRIGHT === '1') {
        const local = PLAYWRIGHT_MOVIES.get(id)
        if (local) return local
      }
      throw new Error('Missing NEXT_PUBLIC_TMDB_API_KEY')
    }
    const url = new URL(`https://api.themoviedb.org/3/movie/${id}`)
    url.searchParams.set('api_key', apiKey)
    const response = await fetch(url)
    if (!response.ok) throw new Error('Movie not found')
    const payload = (await response.json()) as TmdbMovieResponse
    return {
      backdropPath: payload.backdrop_path ?? undefined,
      budget: payload.budget || undefined,
      genres: payload.genres,
      originalTitle: payload.original_title,
      overview: payload.overview,
      posterPath: payload.poster_path ?? undefined,
      releaseDate: payload.release_date,
      revenue: payload.revenue || undefined,
      runtime: payload.runtime ?? undefined,
      tagline: payload.tagline || undefined,
      title: payload.title,
      tmdbId: payload.id,
      voteAverage: payload.vote_average,
      voteCount: payload.vote_count
    }
  },
  Page = () => {
    const createMovie = useMut(reducers.createMovie, {
        getName: (args: { tmdbId: number }) => `movie.create:${args.tmdbId}`,
        toast: { error: 'Failed to cache movie', success: 'Movie cached' }
      }),
      [id, setId] = useState(''),
      [cacheStatus, setCacheStatus] = useState(''),
      [lastTmdbId, setLastTmdbId] = useState<null | number>(null),
      [movie, setMovie] = useState<MovieDetailData | null>(null),
      [fetchError, setFetchError] = useState(''),
      [pending, go] = useTransition()
    return (
      <div className='mx-auto flex max-w-2xl flex-col gap-4 p-4' data-testid='movie-fetch-page'>
        <div className='flex items-center gap-2'>
          <Link className='rounded-lg p-1 hover:bg-muted' href='/'>
            <ArrowLeft className='size-5' />
          </Link>
          <h1 className='text-xl font-semibold'>Fetch by ID</h1>
        </div>
        <form
          className='flex gap-2'
          data-testid='movie-fetch-form'
          onSubmit={e => {
            e.preventDefault()
            const n = Number(id)
            if (!n || n < 1) {
              setFetchError('Enter a valid TMDB ID')
              return
            }
            setFetchError('')
            go(async () => {
              try {
                const loadedMovie = await fetchMovie(n)
                setMovie(loadedMovie)
                setCacheStatus(lastTmdbId === n ? 'Cache Hit' : 'Cache Miss')
                setLastTmdbId(n)
                /** biome-ignore lint/nursery/noFloatingPromises: fire-and-forget cache, useMutation handles errors via toast */
                createMovie(loadedMovie)
              } catch {
                setFetchError('Movie not found')
                setMovie(null)
                setCacheStatus('')
              }
            })
          }}>
          <Input
            data-testid='movie-id-input'
            onChange={e => setId(e.target.value)}
            placeholder='TMDB ID (e.g. 27205)'
            value={id}
          />
        </form>
        <p className='text-xs text-muted-foreground'>
          Try: 27205 (Inception), 550 (Fight Club), 680 (Pulp Fiction), 155 (The Dark Knight)
        </p>
        {fetchError ? (
          <p className='text-sm text-destructive' data-testid='movie-error'>
            {fetchError}
          </p>
        ) : null}
        {pending ? (
          <div className='flex flex-col gap-4' data-testid='movie-loading'>
            <Skeleton className='h-6 w-32' />
            <Skeleton className='h-48 w-full rounded-lg' />
            <div className='flex gap-4'>
              <Skeleton className='h-56 w-36 shrink-0' />
              <div className='flex flex-1 flex-col gap-2'>
                <Skeleton className='h-8 w-64' />
                <Skeleton className='h-4 w-48' />
                <Skeleton className='h-6 w-32' />
                <Skeleton className='mt-2 h-20 w-full' />
              </div>
            </div>
          </div>
        ) : movie ? (
          <div className='flex flex-col gap-4' data-testid='movie-detail'>
            <div className='flex items-center gap-2'>
              <Badge data-testid='cache-status' variant='default'>
                {cacheStatus || 'Fetched from TMDB'}
              </Badge>
              <span className='text-sm text-muted-foreground' data-testid='movie-id'>
                ID: {movie.tmdbId}
              </span>
            </div>
            {movie.backdropPath ? (
              <img
                alt={movie.title}
                className='w-full rounded-lg object-cover'
                src={`${TMDB_BACKDROP}${movie.backdropPath}`}
              />
            ) : null}
            <div className='flex gap-4'>
              {movie.posterPath ? (
                <img
                  alt={movie.title}
                  className='h-56 w-36 shrink-0 rounded-lg object-cover'
                  src={`${TMDB_IMG}${movie.posterPath}`}
                />
              ) : null}
              <div className='flex flex-col gap-2'>
                <h2 className='text-2xl font-bold'>{movie.title}</h2>
                {movie.originalTitle === movie.title ? null : (
                  <p className='text-sm text-muted-foreground'>{movie.originalTitle}</p>
                )}
                {movie.tagline ? <p className='text-muted-foreground italic'>{movie.tagline}</p> : null}
                <div className='flex flex-wrap gap-1'>
                  {movie.genres.map((g: { id: number; name: string }) => (
                    <Badge key={g.id} variant='outline'>
                      {g.name}
                    </Badge>
                  ))}
                </div>
                <div className='mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm [&_span]:text-muted-foreground'>
                  <p>
                    <span>Release:</span> {movie.releaseDate}
                  </p>
                  <p>
                    <span>Runtime:</span> {movie.runtime ?? 'N/A'} min
                  </p>
                  <p>
                    <span>Rating:</span> {movie.voteAverage.toFixed(1)} ({movie.voteCount.toLocaleString()} votes)
                  </p>
                  <p>
                    <span>Budget:</span> {formatMoney(movie.budget)}
                  </p>
                  <p>
                    <span>Revenue:</span> {formatMoney(movie.revenue)}
                  </p>
                </div>
              </div>
            </div>
            <p className='text-muted-foreground'>{movie.overview}</p>
          </div>
        ) : null}
      </div>
    )
  }
export default Page
