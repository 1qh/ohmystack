import { Button } from '@a/rnr/components/button'
import { Text } from '@a/rnr/components/text'
import { Link } from 'expo-router'
import { Pressable, ScrollView } from 'react-native'
const Page = () => (
  <ScrollView className='flex-1 bg-background' contentContainerClassName='gap-4 p-4' testID='login-page'>
    <Text className='text-2xl font-semibold'>Login</Text>
    <Button testID='login-submit'>
      <Text>Continue</Text>
    </Button>
    <Link asChild href='/login/email'>
      <Pressable testID='login-email-link'>
        <Text>Email login</Text>
      </Pressable>
    </Link>
  </ScrollView>
)
export default Page
