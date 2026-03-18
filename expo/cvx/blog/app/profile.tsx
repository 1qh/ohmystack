/** biome-ignore-all lint/complexity/noVoid: fire-and-forget async */
/* oxlint-disable promise/prefer-await-to-then */
import { api } from '@a/be-convex'
import { Button } from '@a/rnr/components/button'
import { Input } from '@a/rnr/components/input'
import { Text } from '@a/rnr/components/text'
import { useMutation, useQuery } from 'convex/react'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView } from 'react-native'

const Page = () => {
  const profile = useQuery(api.blogProfile.get, {}),
    upsert = useMutation(api.blogProfile.upsert),
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
