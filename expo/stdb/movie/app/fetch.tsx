/* oxlint-disable react-perf/jsx-no-new-object-as-prop */
import { reducers } from '@a/be-spacetimedb/spacetimedb'
import { Badge } from '@a/rnr/components/badge'
import { Button } from '@a/rnr/components/button'
import { Card, CardContent } from '@a/rnr/components/card'
import { Input } from '@a/rnr/components/input'
import { Skeleton } from '@a/rnr/components/skeleton'
import { Text } from '@a/rnr/components/text'
import { useMut } from '@noboil/spacetimedb/react'
import { useRouter } from 'expo-router'
import { ArrowLeft, Search } from 'lucide-react-native'
import { useState, useTransition } from 'react'
import { Image, Pressable, ScrollView, View } from 'react-native'
interface MovieDetail {
  backdropPath?: string
  budget?: number
  genres: { id: number; name: string }[]
  originalTitle: string
  overview: string
  posterPath?: string
  releaseDate: string
  revenue?: number
  runtime?: number
  tagline?: string
  title: string
  tmdbId: number
  voteAverage: number
  voteCount: number
}
const TMDB_IMG = 'https://image.tmdb.org/t/p/w300',
  PLAYWRIGHT_MOVIES = new Map<number, MovieDetail>([
    [
      155,
      {
        genres: [{ id: 28, name: 'Action' }],
        originalTitle: 'The Dark Knight',
        overview: 'Batman raises the stakes in his war on crime.',
        posterPath: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
        releaseDate: '2008-07-18',
        title: 'The Dark Knight',
        tmdbId: 155,
        voteAverage: 8.5,
        voteCount: 33_000
      }
    ],
    [
      27_205,
      {
        genres: [{ id: 28, name: 'Action' }],
        originalTitle: 'Inception',
        overview: 'A thief steals information by infiltrating dreams.',
        posterPath: '/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
        releaseDate: '2010-07-16',
        title: 'Inception',
        tmdbId: 27_205,
        voteAverage: 8.4,
        voteCount: 37_000
      }
    ]
  ]),
  fetchMovie = async (id: number): Promise<MovieDetail> => {
    const apiKey = String(process.env.EXPO_PUBLIC_TMDB_API_KEY ?? '')
    if (!apiKey) {
      const local = PLAYWRIGHT_MOVIES.get(id)
      if (local) return local
      throw new Error('Movie not found')
    }
    const url = new URL(`https://api.themoviedb.org/3/movie/${id}`)
    url.searchParams.set('api_key', apiKey)
    const response = await fetch(url)
    if (!response.ok) throw new Error('Movie not found')
    const payload = (await response.json()) as {
      genres: { id: number; name: string }[]
      id: number
      original_title: string
      overview: string
      poster_path: null | string
      release_date: string
      title: string
      vote_average: number
      vote_count: number
    }
    return {
      genres: payload.genres,
      originalTitle: payload.original_title,
      overview: payload.overview,
      posterPath: payload.poster_path ?? undefined,
      releaseDate: payload.release_date,
      title: payload.title,
      tmdbId: payload.id,
      voteAverage: payload.vote_average,
      voteCount: payload.vote_count
    }
  },
  Page = () => {
    const router = useRouter(),
      createMovie = useMut(reducers.createMovie, { toast: { success: 'Movie cached' } }),
      [id, setId] = useState(''),
      [movie, setMovie] = useState<MovieDetail | null>(null),
      [fetchError, setFetchError] = useState(''),
      [pending, go] = useTransition(),
      onSubmit = () => {
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
            await createMovie(loadedMovie)
          } catch {
            setFetchError('Movie not found')
            setMovie(null)
          }
        })
      }
    return (
      <ScrollView
        className='flex-1 bg-background'
        contentContainerClassName='mx-auto w-full max-w-2xl gap-4 p-4'
        testID='movie-fetch-page'>
        <View className='flex-row items-center gap-2'>
          <Pressable className='rounded-md bg-secondary p-2' onPress={() => router.push('/')} testID='movie-back-button'>
            <ArrowLeft className='text-secondary-foreground' size={20} />
          </Pressable>
          <Text className='text-2xl font-semibold'>Fetch by ID</Text>
        </View>
        <View className='gap-2' testID='movie-fetch-form'>
          <Input
            keyboardType='number-pad'
            onChangeText={setId}
            onSubmitEditing={onSubmit}
            placeholder='TMDB ID (e.g. 27205)'
            testID='movie-id-input'
            value={id}
          />
          <Button onPress={onSubmit} testID='movie-fetch-submit'>
            <Search className='text-primary-foreground' size={16} />
            <Text>{pending ? 'Fetching...' : 'Fetch Movie'}</Text>
          </Button>
        </View>
        {fetchError ? (
          <Text className='text-sm text-destructive' testID='movie-error'>
            {fetchError}
          </Text>
        ) : null}
        {pending ? (
          <View className='gap-4' testID='movie-loading'>
            <Skeleton className='h-6 w-32' />
            <Skeleton className='h-48 w-full rounded-lg' />
          </View>
        ) : movie ? (
          <View className='gap-4' testID='movie-detail'>
            <Badge testID='cache-status'>
              <Text>Fetched from TMDB</Text>
            </Badge>
            <Card className='gap-0 py-0'>
              <CardContent className='gap-3 p-4'>
                {movie.posterPath ? (
                  <Image className='h-56 w-36 rounded-lg' source={{ uri: `${TMDB_IMG}${movie.posterPath}` }} />
                ) : null}
                <Text className='text-2xl font-bold'>{movie.title}</Text>
                <Text className='text-sm text-muted-foreground' testID='movie-id'>
                  ID: {movie.tmdbId}
                </Text>
                <Text className='text-muted-foreground'>{movie.overview}</Text>
              </CardContent>
            </Card>
          </View>
        ) : null}
      </ScrollView>
    )
  }
export default Page
