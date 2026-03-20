import { api } from '@a/be-convex'
import { Text } from '@a/rnr/components/text'
import { useList } from '@noboil/convex/react'
import { Link } from 'expo-router'
import { Pressable, ScrollView, View } from 'react-native'
const Page = () => {
  const { items } = useList(api.chat.list, { where: { isPublic: true } })
  return (
    <ScrollView className='flex-1 bg-background' contentContainerClassName='gap-3 p-4' testID='public-chats-page'>
      <Text className='text-xl font-semibold'>Public Chats</Text>
      <View className='gap-2'>
        {items.map(c => (
          <Link asChild href={`/${c._id}`} key={c._id}>
            <Pressable testID='public-chat-item'>
              <Text>{c.title}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </ScrollView>
  )
}
export default Page
