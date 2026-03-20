import { api } from '@a/be-convex'
import { Button } from '@a/rnr/components/button'
import { Input } from '@a/rnr/components/input'
import { Text } from '@a/rnr/components/text'
import { useQuery } from 'convex/react'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
const Page = () => {
  const { id } = useLocalSearchParams<{ id: string }>(),
    chat = useQuery(api.chat.read, id ? { id } : 'skip'),
    [message, setMessage] = useState('')
  return (
    <ScrollView className='flex-1 bg-background' contentContainerClassName='gap-3 p-4' testID='chat-page'>
      <Text className='text-xl font-semibold'>{chat?.title ?? `Chat ${id}`}</Text>
      <View className='gap-2'>
        <Input onChangeText={setMessage} placeholder='Type...' testID='chat-message-input' value={message} />
        <Button testID='chat-message-send'>
          <Text>Send</Text>
        </Button>
      </View>
    </ScrollView>
  )
}
export default Page
