'use client'
/* oxlint-disable forbid-component-props -- shadcn/Tailwind pattern requires className/style on shared components */
import type { ComponentProps } from 'react'
import { cn } from '@a/ui'
import { Input } from '@a/ui/input'
import { Search } from 'lucide-react'
interface SearchInputProps extends Omit<ComponentProps<typeof Input>, 'onChange' | 'type' | 'value'> {
  iconClassName?: string
  iconProps?: ComponentProps<typeof Search>
  inputClassName?: string
  onValueChange: (value: string) => void
  value: string
  wrapperProps?: Omit<ComponentProps<'div'>, 'children'>
}
const SearchInput = ({
  className,
  iconClassName,
  iconProps,
  inputClassName,
  onValueChange,
  value,
  wrapperProps,
  ...props
}: SearchInputProps) => (
  <div {...wrapperProps} className={cn('relative', className, wrapperProps?.className)}>
    <Search
      {...iconProps}
      className={cn(
        'absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground',
        iconClassName,
        iconProps?.className
      )}
    />
    <Input
      {...props}
      className={cn('pl-9', inputClassName)}
      onChange={e => onValueChange(e.target.value)}
      type='search'
      value={value}
    />
  </div>
)
export default SearchInput
