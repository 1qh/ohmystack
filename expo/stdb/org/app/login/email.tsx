import { Button } from '@a/rnr/components/button'
import { Input } from '@a/rnr/components/input'
import { Text } from '@a/rnr/components/text'
import { ScrollView } from 'react-native'
const Page = () => (
  <ScrollView className='flex-1 bg-background' contentContainerClassName='gap-4 p-4' testID='login-email-page'>
    <Text className='text-2xl font-semibold'>Email Login</Text>
    <Input placeholder='Email' testID='email-input' />
    <Button testID='email-submit'>
      <Text>Send magic link</Text>
    </Button>
  </ScrollView>
)
export default Page
