'use client'
import type { ComponentProps } from 'react'
import { cn } from '@a/ui'
import { ToggleGroup, ToggleGroupItem } from '@a/ui/toggle-group'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useMemo } from 'react'
interface ThemeToggleProps {
  className?: string
  darkIconProps?: ComponentProps<typeof Moon>
  iconClassName?: string
  itemClassName?: string
  itemProps?: Omit<ComponentProps<typeof ToggleGroupItem>, 'children' | 'value'>
  lightIconProps?: ComponentProps<typeof Sun>
  rootProps?: Omit<ComponentProps<typeof ToggleGroup>, 'children' | 'onValueChange' | 'value'>
  systemIconProps?: ComponentProps<typeof Monitor>
}
const ThemeToggle = ({
  className,
  darkIconProps,
  iconClassName,
  itemClassName,
  itemProps,
  lightIconProps,
  rootProps,
  systemIconProps
}: ThemeToggleProps) => {
  const { setTheme, theme } = useTheme()
  const selectedTheme = theme ?? 'system'
  const selectedThemeValue = useMemo(() => [selectedTheme], [selectedTheme])
  return (
    <ToggleGroup
      {...rootProps}
      className={cn('*:p-2', className, rootProps?.className)}
      onValueChange={value => setTheme(value[0] ?? 'system')}
      value={selectedThemeValue}>
      <ToggleGroupItem {...itemProps} className={cn(itemClassName, itemProps?.className)} value='light'>
        <Sun {...lightIconProps} className={cn(iconClassName, lightIconProps?.className)} />
      </ToggleGroupItem>
      <ToggleGroupItem {...itemProps} className={cn(itemClassName, itemProps?.className)} value='dark'>
        <Moon {...darkIconProps} className={cn(iconClassName, darkIconProps?.className)} />
      </ToggleGroupItem>
      <ToggleGroupItem {...itemProps} className={cn(itemClassName, itemProps?.className)} value='system'>
        <Monitor {...systemIconProps} className={cn(iconClassName, systemIconProps?.className)} />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
export default ThemeToggle
