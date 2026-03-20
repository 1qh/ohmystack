import { Text } from '@a/rnr/components/text'
import { Link } from 'expo-router'
import { Pressable, ScrollView } from 'react-native'
const Page = () => (
  <ScrollView className='flex-1 bg-background' contentContainerClassName='gap-3 p-4' testID='screen-page'>
    <Text>Screen</Text>
    <Link asChild href='/'>
      <Pressable testID='back-home'>
        <Text>Back home</Text>
      </Pressable>
    </Link>
  </ScrollView>
)
export default Page
