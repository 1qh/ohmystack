'use client'

import { ToggleGroup, ToggleGroupItem } from '@a/ui/toggle-group'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useMemo } from 'react'

const ThemeToggle = () => {
  const { setTheme, theme } = useTheme(),
    selectedTheme = theme ?? 'system',
    selectedThemeValue = useMemo(() => [selectedTheme], [selectedTheme])
  return (
    <ToggleGroup className='*:p-2' onValueChange={value => setTheme(value[0] ?? 'system')} value={selectedThemeValue}>
      <ToggleGroupItem value='light'>
        <Sun />
      </ToggleGroupItem>
      <ToggleGroupItem value='dark'>
        <Moon />
      </ToggleGroupItem>
      <ToggleGroupItem value='system'>
        <Monitor />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

export default ThemeToggle
