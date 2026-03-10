'use client'

import { ToggleGroup, ToggleGroupItem } from '@a/ui/toggle-group'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

const ThemeToggle = () => {
  const { setTheme, theme } = useTheme()
  return (
    <ToggleGroup className='*:p-2' onValueChange={setTheme} type='single' value={theme}>
      <ToggleGroupItem asChild value='light'>
        <Sun />
      </ToggleGroupItem>
      <ToggleGroupItem asChild value='dark'>
        <Moon />
      </ToggleGroupItem>
      <ToggleGroupItem asChild value='system'>
        <Monitor />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

export default ThemeToggle
