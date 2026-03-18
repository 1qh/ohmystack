import { tables } from '@a/be-spacetimedb/spacetimedb'
import { Text } from '@a/rnr/components/text'
import { useList } from '@noboil/spacetimedb/react'
import { useRouter } from 'expo-router'
import { Pressable, ScrollView, View } from 'react-native'
import { useTable } from 'spacetimedb/react'

const Page = () => {
  const router = useRouter(),
    [rows, ready] = useTable(tables.chat),
    { data: chats } = useList(rows, ready, { where: { isPublic: true } })
  return (
    <ScrollView className='flex-1 bg-background' contentContainerClassName='gap-3 p-4' testID='public-chats-page'>
      <Text className='text-xl font-semibold'>Public Chats</Text>
      <View className='gap-2'>
        {chats.map(c => (
          <Pressable key={c.id} onPress={() => router.push(`/${c.id}`)} testID='public-chat-item'>
            <Text>{c.title}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  )
}

export default Page
