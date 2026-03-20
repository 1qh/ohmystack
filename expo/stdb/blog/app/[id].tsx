import { Button } from '@a/rnr/components/button'
import { Text } from '@a/rnr/components/text'
import { Link, useLocalSearchParams } from 'expo-router'
import { Pressable, ScrollView } from 'react-native'
const Page = () => {
  const { id } = useLocalSearchParams<{ id: string }>()
  return (
    <ScrollView className='flex-1 bg-background' contentContainerClassName='gap-3 p-4' testID='blog-detail-page'>
      <Text className='text-xl'>Blog {id}</Text>
      <Link asChild href={`/${id}/edit`}>
        <Pressable testID='edit-link'>
          <Text>Edit</Text>
        </Pressable>
      </Link>
      <Button testID='delete-confirm'>
        <Text>Delete</Text>
      </Button>
    </ScrollView>
  )
}
export default Page
