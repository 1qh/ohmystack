/* eslint-disable @next/next/no-img-element */
/** biome-ignore-all lint/correctness/useImageSize: external TMDB image URLs */
/** biome-ignore-all lint/performance/noImgElement: external TMDB image URLs */
'use client'
import { api } from '@a/be-convex'
import { Badge } from '@a/ui/badge'
import { Input } from '@a/ui/input'
import { Skeleton } from '@a/ui/skeleton'
import { useAction } from 'convex/react'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition } from 'react'

import type { Movie } from '../types'

const TMDB_IMG = 'https://image.tmdb.org/t/p/w300',
  TMDB_BACKDROP = 'https://image.tmdb.org/t/p/w780',
  formatMoney = (n: null | number) => (n ? `$${(n / 1_000_000).toFixed(1)}M` : 'N/A'),
  MovieDetail = ({ movie }: { movie: Movie }) => (
    <div className='flex flex-col gap-4' data-testid='movie-detail'>
      <div className='flex items-center gap-2'>
        <Badge data-testid='cache-status' variant={movie.cacheHit ? 'secondary' : 'default'}>
          {movie.cacheHit ? 'Cache Hit' : 'Cache Miss → Fetched'}
        </Badge>
        <span className='text-sm text-muted-foreground' data-testid='movie-id'>
          ID: {movie.tmdb_id}
        </span>
      </div>
      {movie.backdrop_path ? (
        <img alt={movie.title} className='w-full rounded-lg object-cover' src={`${TMDB_BACKDROP}${movie.backdrop_path}`} />
      ) : null}
      <div className='flex gap-4'>
        {movie.poster_path ? (
          <img
            alt={movie.title}
            className='h-56 w-36 shrink-0 rounded-lg object-cover'
            src={`${TMDB_IMG}${movie.poster_path}`}
          />
        ) : null}
        <div className='flex flex-col gap-2'>
          <h2 className='text-2xl font-bold'>{movie.title}</h2>
          {movie.original_title === movie.title ? null : (
            <p className='text-sm text-muted-foreground'>{movie.original_title}</p>
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
              <span>Release:</span> {movie.release_date}
            </p>
            <p>
              <span>Runtime:</span> {movie.runtime ?? 'N/A'} min
            </p>
            <p>
              <span>Rating:</span> {movie.vote_average.toFixed(1)} ({movie.vote_count.toLocaleString()} votes)
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
  ),
  Page = () => {
    const fetchById = useAction(api.movie.load),
      [id, setId] = useState(''),
      [movie, setMovie] = useState<Movie | null>(null),
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
                const res = await fetchById({ tmdb_id: n })
                setMovie(res)
              } catch {
                setFetchError('Movie not found')
                setMovie(null)
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
          <MovieDetail movie={movie} />
        ) : null}
      </div>
    )
  }
export default Page
