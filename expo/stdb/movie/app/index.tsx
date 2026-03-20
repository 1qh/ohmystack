/* oxlint-disable react-perf/jsx-no-new-object-as-prop */
import { Button } from '@a/rnr/components/button'
import { Card, CardContent } from '@a/rnr/components/card'
import { Input } from '@a/rnr/components/input'
import { Text } from '@a/rnr/components/text'
import { useErrorToast, useOnlineStatus } from '@noboil/spacetimedb/react'
import { Link } from 'expo-router'
import { Search } from 'lucide-react-native'
import { useState, useTransition } from 'react'
import { Image, Pressable, ScrollView, View } from 'react-native'
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
    }
  ],
  searchMovies = async (query: string) => {
    const apiKey = String(process.env.EXPO_PUBLIC_TMDB_API_KEY ?? '')
    if (!apiKey) {
      const q = query.toLowerCase(),
        rows: SearchResult[] = []
      for (const m of PLAYWRIGHT_MOVIES) if (m.title.toLowerCase().includes(q)) rows.push(m)
      return rows
    }
    const url = new URL('https://api.themoviedb.org/3/search/movie')
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('query', query)
    const response = await fetch(url)
    if (!response.ok) throw new Error('Search failed')
    const payload = (await response.json()) as TmdbSearchResponse
    return payload.results
  },
  MovieCard = ({ movie }: { movie: SearchResult }) => (
    <Card className='gap-0 py-0' testID='movie-card'>
      <CardContent className='flex-row gap-3 p-3'>
        {movie.poster_path ? (
          <Image
            className='h-32 w-20 rounded-md'
            source={{ uri: `${TMDB_IMG}${movie.poster_path}` }}
            testID='movie-poster'
          />
        ) : null}
        <View className='flex-1 gap-1'>
          <Text className='font-medium' testID='movie-title'>
            {movie.title}
          </Text>
          <Text className='text-xs text-muted-foreground' testID='movie-meta'>
            {movie.release_date.slice(0, 4)} - {movie.vote_average.toFixed(1)}
          </Text>
        </View>
      </CardContent>
    </Card>
  ),
  Page = () => {
    const isOnline = useOnlineStatus(),
      [movieError, setMovieError] = useState(''),
      handleError = useErrorToast({
        toast: (message: string) => {
          setMovieError(message)
        }
      }),
      [query, setQuery] = useState(''),
      [results, setResults] = useState<SearchResult[]>([]),
      [pending, go] = useTransition(),
      onSubmit = () => {
        if (!query.trim()) return
        go(async () => {
          try {
            const rows = await searchMovies(query.trim())
            setResults(rows)
          } catch (error) {
            setResults([])
            handleError(error)
          }
        })
      }
    return (
      <ScrollView
        className='flex-1 bg-background'
        contentContainerClassName='mx-auto w-full max-w-2xl gap-4 p-4'
        testID='movie-search-page'>
        <View className='flex-row items-center justify-between'>
          <Text className='text-2xl font-semibold'>Movie Search</Text>
          <Link asChild href='/fetch'>
            <Pressable className='rounded-md bg-secondary px-3 py-2' testID='movie-fetch-link'>
              <Text className='text-sm text-secondary-foreground'>Fetch by ID -&gt;</Text>
            </Pressable>
          </Link>
        </View>
        <View className='gap-2' testID='movie-search-form'>
          <Input
            onChangeText={setQuery}
            onSubmitEditing={onSubmit}
            placeholder={pending ? 'Searching...' : 'Search movies...'}
            testID='movie-search-input'
            value={query}
          />
          <Button onPress={onSubmit} testID='movie-search-submit'>
            <Search className='text-primary-foreground' size={16} />
            <Text>{pending ? 'Searching...' : 'Search'}</Text>
          </Button>
        </View>
        {isOnline ? null : (
          <Text className='rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive' testID='offline-banner'>
            You are offline - search requires internet
          </Text>
        )}
        {movieError ? (
          <Text className='rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive' testID='movie-error'>
            {movieError}
          </Text>
        ) : null}
        <View className='gap-3' testID='movie-results'>
          {results.map(m => (
            <MovieCard key={m.tmdb_id} movie={m} />
          ))}
        </View>
      </ScrollView>
    )
  }
export default Page
