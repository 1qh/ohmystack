/* eslint-disable @typescript-eslint/no-unsafe-call */
import { cn } from '@a/rnr'
import { Button } from '@a/rnr/components/button'
import { Text } from '@a/rnr/components/text'
import { Monitor, Moon, Sun } from 'lucide-react-native'
import { View } from 'react-native'
import { useUniwind } from 'uniwind'
interface ThemeToggleProps {
  className?: string
}
const ThemeToggle = ({ className }: ThemeToggleProps) => {
  const { setTheme, theme } = useUniwind()
  return (
    <View className={cn('flex-row gap-1', className)}>
      <Button
        className={cn('p-2', theme === 'light' && 'bg-accent')}
        onPress={() => {
          setTheme('light')
        }}
        size='icon'
        variant='ghost'>
        <Sun className='text-foreground' size={16} />
        <Text className='sr-only'>Light</Text>
      </Button>
      <Button
        className={cn('p-2', theme === 'dark' && 'bg-accent')}
        onPress={() => {
          setTheme('dark')
        }}
        size='icon'
        variant='ghost'>
        <Moon className='text-foreground' size={16} />
        <Text className='sr-only'>Dark</Text>
      </Button>
      <Button
        className={cn('p-2', theme === 'system' && 'bg-accent')}
        onPress={() => {
          setTheme('system')
        }}
        size='icon'
        variant='ghost'>
        <Monitor className='text-foreground' size={16} />
        <Text className='sr-only'>System</Text>
      </Button>
    </View>
  )
}
export default ThemeToggle
