/** biome-ignore-all lint/complexity/noVoid: fire-and-forget async */
/* oxlint-disable promise/prefer-await-to-then */
import { api } from '@a/be-convex'
import { Button } from '@a/rnr/components/button'
import { Input } from '@a/rnr/components/input'
import { Text } from '@a/rnr/components/text'
import { useList } from '@noboil/convex/react'
import { useMutation } from 'convex/react'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'

const Page = () => {
  const router = useRouter(),
    createChat = useMutation(api.chat.create),
    { items } = useList(api.chat.list, { where: { own: true } }),
    [query, setQuery] = useState(''),
    [isPublic, setIsPublic] = useState(false),
    onCreate = () => {
      const run = async () => {
        if (!query.trim()) return
        const created = await createChat({ isPublic, title: query }),
          chatId = Array.isArray(created) ? created[0] : created
        if (typeof chatId === 'string') router.push(`/${chatId}`)
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
        {items.map(c => (
          <Link asChild href={`/${c._id}`} key={c._id}>
            <Pressable testID='chat-item'>
              <Text>{c.title}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </ScrollView>
  )
}

export default Page
