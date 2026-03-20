/** biome-ignore-all lint/complexity/noVoid: fire-and-forget async */
/* oxlint-disable promise/prefer-await-to-then */
import { api } from '@a/be-convex'
import { Button } from '@a/rnr/components/button'
import { Input } from '@a/rnr/components/input'
import { Text } from '@a/rnr/components/text'
import { useList } from '@noboil/convex/react'
import { useMutation } from 'convex/react'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
const Page = () => {
  const { items } = useList(api.blog.list, { where: { or: [{ published: true }, { own: true }] } }),
    create = useMutation(api.blog.create),
    rm = useMutation(api.blog.rm),
    [title, setTitle] = useState(''),
    [content, setContent] = useState(''),
    onCreate = () => {
      const run = async () => {
        if (!(title.trim() && content.trim())) return
        await create({ category: 'tech', content, published: false, title })
        setTitle('')
        setContent('')
      }
      run().catch(() => undefined)
    },
    onRemove = (id: string) => {
      const run = async () => {
        await rm({ id })
      }
      run().catch(() => undefined)
    }
  return (
    <ScrollView className='flex-1 bg-background' contentContainerClassName='gap-3 p-4' testID='crud-dynamic-page'>
      <Text className='text-2xl font-semibold'>Blog</Text>
      <View className='gap-2'>
        <Input onChangeText={setTitle} placeholder='Title' testID='blog-title' value={title} />
        <Input onChangeText={setContent} placeholder='Content' testID='blog-content' value={content} />
        <Button onPress={onCreate} testID='create-blog-submit'>
          <Text>Create</Text>
        </Button>
      </View>
      <View className='flex-row gap-2'>
        <Link asChild href='/pagination'>
          <Pressable className='rounded-md bg-secondary px-3 py-2' testID='pagination-link'>
            <Text>Pagination</Text>
          </Pressable>
        </Link>
        <Link asChild href='/profile'>
          <Pressable className='rounded-md bg-secondary px-3 py-2' testID='profile-link'>
            <Text>Profile</Text>
          </Pressable>
        </Link>
      </View>
      {items.map(b => (
        <View className='rounded-md border border-border p-3' key={b._id}>
          <Link asChild href={`/${b._id}`}>
            <Pressable testID='blog-card-link'>
              <Text className='font-medium' testID='blog-card-title'>
                {b.title}
              </Text>
            </Pressable>
          </Link>
          <Button onPress={() => onRemove(b._id)} testID='delete-blog-trigger' variant='ghost'>
            <Text>Delete</Text>
          </Button>
        </View>
      ))}
    </ScrollView>
  )
}
export default Page
