import { cn } from '@a/rnr'
import { Input } from '@a/rnr/components/input'
import { Search } from 'lucide-react-native'
import { View } from 'react-native'
interface SearchInputProps {
  className?: string
  onValueChange: (value: string) => void
  placeholder?: string
  testID?: string
  value: string
}
const SearchInput = ({ className, onValueChange, placeholder, testID, value }: SearchInputProps) => (
  <View className={cn('relative', className)}>
    <Search className='absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground' size={16} />
    <Input className='pl-10' onChangeText={onValueChange} placeholder={placeholder} testID={testID} value={value} />
  </View>
)
export default SearchInput
