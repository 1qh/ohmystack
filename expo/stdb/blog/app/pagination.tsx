import { Text } from '@a/rnr/components/text'
import { Link } from 'expo-router'
import { Pressable, ScrollView } from 'react-native'
const Page = () => (
  <ScrollView className='flex-1 bg-background' contentContainerClassName='gap-3 p-4' testID='crud-pagination-page'>
    <Text>Pagination screen</Text>
    <Link asChild href='/'>
      <Pressable testID='pagination-back'>
        <Text>Back</Text>
      </Pressable>
    </Link>
  </ScrollView>
)
export default Page
