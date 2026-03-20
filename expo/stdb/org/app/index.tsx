import { Button } from '@a/rnr/components/button'
import { Text } from '@a/rnr/components/text'
import { Link } from 'expo-router'
import { Pressable, ScrollView, View } from 'react-native'
const links = [
    '/dashboard',
    '/members',
    '/projects',
    '/wiki',
    '/settings',
    '/onboarding',
    '/new',
    '/join/demo-org',
    '/invite/demo-token',
    '/login',
    '/login/email'
  ] as const,
  Page = () => (
    <ScrollView className='flex-1 bg-background' contentContainerClassName='gap-3 p-4' testID='org-home-page'>
      <Text className='text-2xl font-semibold'>Organizations</Text>
      <View className='gap-2'>
        {links.map(path => (
          <Link asChild href={path} key={path}>
            <Pressable className='rounded-md border border-border px-3 py-2' testID={`route-${path.replaceAll('/', '_')}`}>
              <Text>{path}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
      <Button testID='org-primary-action'>
        <Text>Create organization</Text>
      </Button>
    </ScrollView>
  )
export default Page
