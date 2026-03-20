/* oxlint-disable react-perf/jsx-no-new-object-as-prop */
import type { FunctionReturnType } from 'convex/server'

import { api } from '@a/be-convex'
import { Badge } from '@a/rnr/components/badge'
import { Button } from '@a/rnr/components/button'
import { Card, CardContent } from '@a/rnr/components/card'
import { Input } from '@a/rnr/components/input'
import { Skeleton } from '@a/rnr/components/skeleton'
import { Text } from '@a/rnr/components/text'
import { useAction } from 'convex/react'
import { useRouter } from 'expo-router'
import { ArrowLeft, Search } from 'lucide-react-native'
import { useState, useTransition } from 'react'
import { Image, Pressable, ScrollView, View } from 'react-native'
type Movie = FunctionReturnType<typeof api.movie.load>
const TMDB_IMG = 'https://image.tmdb.org/t/p/w300',
  TMDB_BACKDROP = 'https://image.tmdb.org/t/p/w780',
  formatMoney = (n: null | number) => (n ? `$${(n / 1_000_000).toFixed(1)}M` : 'N/A'),
  MovieDetail = ({ movie }: { movie: Movie }) => (
    <View className='gap-4' testID='movie-detail'>
      <View className='flex-row items-center gap-2'>
        <Badge testID='cache-status' variant={movie.cacheHit ? 'secondary' : 'default'}>
          <Text>{movie.cacheHit ? 'Cache Hit' : 'Cache Miss → Fetched'}</Text>
        </Badge>
        <Text className='text-sm text-muted-foreground' testID='movie-id'>
          ID: {movie.tmdb_id}
        </Text>
      </View>
      {movie.backdrop_path ? (
        <Image
          className='h-44 w-full rounded-lg'
          resizeMode='cover'
          source={{ uri: `${TMDB_BACKDROP}${movie.backdrop_path}` }}
        />
      ) : null}
      <Card className='gap-0 py-0'>
        <CardContent className='gap-4 p-4'>
          <View className='flex-row gap-4'>
            {movie.poster_path ? (
              <Image
                className='h-56 w-36 rounded-lg'
                resizeMode='cover'
                source={{ uri: `${TMDB_IMG}${movie.poster_path}` }}
              />
            ) : null}
            <View className='flex-1 gap-2'>
              <Text className='text-2xl font-bold'>{movie.title}</Text>
              {movie.original_title === movie.title ? null : (
                <Text className='text-sm text-muted-foreground'>{movie.original_title}</Text>
              )}
              {movie.tagline ? <Text className='text-muted-foreground italic'>{movie.tagline}</Text> : null}
              <View className='flex-row flex-wrap gap-1'>
                {movie.genres.map(g => (
                  <Badge key={g.id} variant='outline'>
                    <Text>{g.name}</Text>
                  </Badge>
                ))}
              </View>
              <View className='gap-1'>
                <Text className='text-sm'>
                  <Text className='text-muted-foreground'>Release:</Text> {movie.release_date}
                </Text>
                <Text className='text-sm'>
                  <Text className='text-muted-foreground'>Runtime:</Text> {movie.runtime ?? 'N/A'} min
                </Text>
                <Text className='text-sm'>
                  <Text className='text-muted-foreground'>Rating:</Text> {movie.vote_average.toFixed(1)} (
                  {movie.vote_count.toLocaleString()} votes)
                </Text>
                <Text className='text-sm'>
                  <Text className='text-muted-foreground'>Budget:</Text> {formatMoney(movie.budget)}
                </Text>
                <Text className='text-sm'>
                  <Text className='text-muted-foreground'>Revenue:</Text> {formatMoney(movie.revenue)}
                </Text>
              </View>
            </View>
          </View>
          <Text className='text-muted-foreground'>{movie.overview}</Text>
        </CardContent>
      </Card>
    </View>
  ),
  Page = () => {
    const router = useRouter(),
      fetchById = useAction(api.movie.load),
      [id, setId] = useState(''),
      [movie, setMovie] = useState<Movie | null>(null),
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
            const response = await fetchById({ tmdb_id: n })
            setMovie(response)
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
          <Pressable
            className='rounded-md bg-secondary p-2'
            onPress={() => {
              router.push('/')
            }}
            testID='movie-back-button'>
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
            returnKeyType='search'
            testID='movie-id-input'
            value={id}
          />
          <Button onPress={onSubmit} testID='movie-fetch-submit'>
            <Search className='text-primary-foreground' size={16} />
            <Text>{pending ? 'Fetching...' : 'Fetch Movie'}</Text>
          </Button>
        </View>
        <Text className='text-xs text-muted-foreground'>
          Try: 27205 (Inception), 550 (Fight Club), 680 (Pulp Fiction), 155 (The Dark Knight)
        </Text>
        {fetchError ? (
          <Text className='text-sm text-destructive' testID='movie-error'>
            {fetchError}
          </Text>
        ) : null}
        {pending ? (
          <View className='gap-4' testID='movie-loading'>
            <Skeleton className='h-6 w-32' />
            <Skeleton className='h-48 w-full rounded-lg' />
            <View className='flex-row gap-4'>
              <Skeleton className='h-56 w-36' />
              <View className='flex-1 gap-2'>
                <Skeleton className='h-8 w-64' />
                <Skeleton className='h-4 w-48' />
                <Skeleton className='h-6 w-32' />
                <Skeleton className='h-20 w-full' />
              </View>
            </View>
          </View>
        ) : movie ? (
          <MovieDetail movie={movie} />
        ) : null}
      </ScrollView>
    )
  }
export default Page
