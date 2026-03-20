/** biome-ignore-all lint/complexity/noVoid: fire-and-forget async */
/* oxlint-disable promise/prefer-await-to-then */
import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { Button } from '@a/rnr/components/button'
import { Input } from '@a/rnr/components/input'
import { Text } from '@a/rnr/components/text'
import { useList } from '@noboil/spacetimedb/react'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useReducer, useTable } from 'spacetimedb/react'
const Page = () => {
  const [rows, ready] = useTable(tables.blog),
    { data: items } = useList(rows, ready, { where: { or: [{ published: true }, { own: true }] } }),
    create = useReducer(reducers.createBlog),
    rm = useReducer(reducers.rmBlog),
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
    onRemove = (id: number) => {
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
        <View className='rounded-md border border-border p-3' key={b.id}>
          <Link asChild href={`/${b.id}`}>
            <Pressable testID='blog-card-link'>
              <Text className='font-medium' testID='blog-card-title'>
                {b.title}
              </Text>
            </Pressable>
          </Link>
          <Button onPress={() => onRemove(b.id)} testID='delete-blog-trigger' variant='ghost'>
            <Text>Delete</Text>
          </Button>
        </View>
      ))}
    </ScrollView>
  )
}
export default Page
