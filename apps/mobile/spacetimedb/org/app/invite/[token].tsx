import { Text } from '@a/rnr/components/text'
import { Link, useLocalSearchParams } from 'expo-router'
import { Pressable, ScrollView } from 'react-native'

const Page = () => {
  const params = useLocalSearchParams<{ projectId?: string; slug?: string; token?: string; wikiId?: string }>()
  return (
    <ScrollView className='flex-1 bg-background' contentContainerClassName='gap-3 p-4' testID='detail-page'>
      <Text>{JSON.stringify(params)}</Text>
      <Link asChild href='/'>
        <Pressable testID='back-home'>
          <Text>Back home</Text>
        </Pressable>
      </Link>
    </ScrollView>
  )
}

export default Page
