/* oxlint-disable react-perf/jsx-no-new-object-as-prop */
import type { FunctionReturnType } from 'convex/server'

import { api } from '@a/be-convex'
import { Badge } from '@a/rnr/components/badge'
import { Button } from '@a/rnr/components/button'
import { Card, CardContent } from '@a/rnr/components/card'
import { Input } from '@a/rnr/components/input'
import { Text } from '@a/rnr/components/text'
import { useAction } from 'convex/react'
import { Link } from 'expo-router'
import { Search } from 'lucide-react-native'
import { useState, useTransition } from 'react'
import { Image, Pressable, ScrollView, View } from 'react-native'

type SearchResult = FunctionReturnType<typeof api.movie.search>[number]

const TMDB_IMG = 'https://image.tmdb.org/t/p/w200',
  MovieCard = ({ movie }: { movie: SearchResult }) => (
    <Card className='gap-0 py-0' testID='movie-card'>
      <CardContent className='flex-row gap-3 p-3'>
        {movie.poster_path ? (
          <Image
            accessibilityLabel={movie.title}
            className='h-32 w-20 rounded-md'
            resizeMode='cover'
            source={{ uri: `${TMDB_IMG}${movie.poster_path}` }}
            testID='movie-poster'
          />
        ) : (
          <View className='h-32 w-20 items-center justify-center rounded-md bg-muted'>
            <Text className='text-xs text-muted-foreground'>No image</Text>
          </View>
        )}
        <View className='flex-1 gap-1'>
          <Text className='font-medium' testID='movie-title'>
            {movie.title}
          </Text>
          <Text className='text-xs text-muted-foreground' testID='movie-meta'>
            {movie.release_date.slice(0, 4)} • {movie.vote_average.toFixed(1)} • ID: {movie.tmdb_id}
          </Text>
          <Text className='text-muted-foreground' numberOfLines={3}>
            {movie.overview}
          </Text>
        </View>
      </CardContent>
    </Card>
  ),
  Page = () => {
    const search = useAction(api.movie.search),
      [query, setQuery] = useState(''),
      [results, setResults] = useState<SearchResult[]>([]),
      [pending, go] = useTransition(),
      onSubmit = () => {
        if (!query.trim()) return
        go(async () => {
          const nextResults = await search({ query: query.trim() })
          setResults(nextResults)
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
            <Pressable accessibilityRole='link' className='rounded-md bg-secondary px-3 py-2' testID='movie-fetch-link'>
              <Text className='text-sm text-secondary-foreground'>Fetch by ID →</Text>
            </Pressable>
          </Link>
        </View>

        <View className='gap-2' testID='movie-search-form'>
          <Input
            autoCapitalize='none'
            autoCorrect={false}
            onChangeText={setQuery}
            onSubmitEditing={onSubmit}
            placeholder={pending ? 'Searching...' : 'Search movies...'}
            returnKeyType='search'
            testID='movie-search-input'
            value={query}
          />
          <Button onPress={onSubmit} testID='movie-search-submit'>
            <Search className='text-primary-foreground' size={16} />
            <Text>{pending ? 'Searching...' : 'Search'}</Text>
          </Button>
        </View>

        {results.length > 0 ? (
          <View className='gap-3' testID='movie-results'>
            <Badge className='self-start' variant='secondary'>
              <Text>{results.length} results</Text>
            </Badge>
            {results.map(m => (
              <MovieCard key={m.tmdb_id} movie={m} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    )
  }

export default Page
