/** biome-ignore-all lint/complexity/noVoid: fire-and-forget async */
/* oxlint-disable promise/prefer-await-to-then */
import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { Button } from '@a/rnr/components/button'
import { Input } from '@a/rnr/components/input'
import { Text } from '@a/rnr/components/text'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView } from 'react-native'
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'
const Page = () => {
  const { identity } = useSpacetimeDB(),
    [profiles] = useTable(tables.blogProfile),
    profile = profiles.find(p => identity && p.userId.isEqual(identity)),
    upsert = useReducer(reducers.upsertBlogProfile),
    [displayName, setDisplayName] = useState(profile?.displayName ?? ''),
    onSave = () => {
      const run = async () => {
        await upsert({ displayName, notifications: true, theme: 'system' })
      }
      run().catch(() => undefined)
    }
  return (
    <ScrollView className='flex-1 bg-background' contentContainerClassName='gap-3 p-4' testID='profile-page'>
      <Link asChild href='/'>
        <Pressable testID='profile-back'>
          <Text>Back</Text>
        </Pressable>
      </Link>
      <Input onChangeText={setDisplayName} placeholder='Display name' testID='profile-displayName' value={displayName} />
      <Button onPress={onSave} testID='profile-submit'>
        <Text>Save</Text>
      </Button>
    </ScrollView>
  )
}
export default Page
