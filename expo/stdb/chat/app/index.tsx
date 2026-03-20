/** biome-ignore-all lint/complexity/noVoid: fire-and-forget async */
/* oxlint-disable promise/prefer-await-to-then */
import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { Button } from '@a/rnr/components/button'
import { Input } from '@a/rnr/components/input'
import { Text } from '@a/rnr/components/text'
import { useList } from '@noboil/spacetimedb/react'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useReducer, useTable } from 'spacetimedb/react'
const Page = () => {
  const router = useRouter(),
    [rows, ready] = useTable(tables.chat),
    { data: chats } = useList(rows, ready, { where: { own: true } }),
    createChat = useReducer(reducers.createChat),
    [query, setQuery] = useState(''),
    [isPublic, setIsPublic] = useState(false),
    onCreate = () => {
      const run = async () => {
        if (!query.trim()) return
        await createChat({ isPublic, title: query })
      }
      run().catch(() => undefined)
    }
  return (
    <ScrollView className='flex-1 bg-background' contentContainerClassName='gap-3 p-4' testID='chat-home-page'>
      <Text className='text-2xl font-semibold'>Chat</Text>
      <Input onChangeText={setQuery} placeholder='Send a message...' testID='chat-input' value={query} />
      <Button onPress={onCreate} testID='send-button'>
        <Text>Start chat</Text>
      </Button>
      <Button onPress={() => setIsPublic(v => !v)} testID='public-toggle' variant='secondary'>
        <Text>{isPublic ? 'Public' : 'Private'}</Text>
      </Button>
      <Link asChild href='/public'>
        <Pressable testID='public-list-link'>
          <Text>Public chats</Text>
        </Pressable>
      </Link>
      <View className='gap-2'>
        {chats.map(c => (
          <Pressable key={c.id} onPress={() => router.push(`/${c.id}`)} testID='chat-item'>
            <Text>{c.title}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  )
}
export default Page
