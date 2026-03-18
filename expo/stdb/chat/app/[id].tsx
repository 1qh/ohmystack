import { tables } from '@a/be-spacetimedb/spacetimedb'
import { Button } from '@a/rnr/components/button'
import { Input } from '@a/rnr/components/input'
import { Text } from '@a/rnr/components/text'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { useTable } from 'spacetimedb/react'

const Page = () => {
  const { id } = useLocalSearchParams<{ id: string }>(),
    [rows] = useTable(tables.chat),
    chat = rows.find(c => String(c.id) === id),
    [message, setMessage] = useState('')

  return (
    <ScrollView className='flex-1 bg-background' contentContainerClassName='gap-3 p-4' testID='chat-page'>
      <Text className='text-xl font-semibold'>{chat?.title ?? `Chat ${id}`}</Text>
      <Input onChangeText={setMessage} placeholder='Type...' testID='chat-message-input' value={message} />
      <Button testID='chat-message-send'>
        <Text>Send</Text>
      </Button>
    </ScrollView>
  )
}

export default Page
