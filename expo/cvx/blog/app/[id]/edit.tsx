import { Button } from '@a/rnr/components/button'
import { Input } from '@a/rnr/components/input'
import { Text } from '@a/rnr/components/text'
import { useLocalSearchParams } from 'expo-router'
import { ScrollView } from 'react-native'
const Page = () => {
  const { id } = useLocalSearchParams<{ id: string }>()
  return (
    <ScrollView className='flex-1 bg-background' contentContainerClassName='gap-3 p-4' testID='blog-edit-page'>
      <Text>Edit {id}</Text>
      <Input placeholder='Title' testID='edit-title' />
      <Button testID='save-edit'>
        <Text>Save</Text>
      </Button>
    </ScrollView>
  )
}
export default Page
