import type { Popover as PopoverPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { api } from '@a/be-convex'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@a/ui/alert-dialog'
import { Button } from '@a/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@a/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@a/ui/toggle-group'
import { convexAuthNextjsToken as tok } from '@convex-dev/auth/nextjs/server'
import { fetchAction, fetchQuery } from 'convex/nextjs'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'

const ThemeToggle = () => {
    const { setTheme, theme } = useTheme(),
      selectedTheme = theme ?? 'system'
    return (
      <ToggleGroup className='*:p-2' onValueChange={value => setTheme(value[0] ?? 'system')} value={[selectedTheme]}>
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
  },
  UserMenu = async ({ ...props }: ComponentProps<typeof PopoverPrimitive.Trigger>) => {
    await connection()
    const token = await tok(),
      { user } = api,
      { email, image, name } = token
        ? ((await fetchQuery(user.me, {}, { token })) as { email?: string; image?: string; name?: string })
        : {}
    return (
      <Popover>
        <PopoverTrigger
          render={
            <button {...props} aria-label='User menu' className='size-8 shrink-0 rounded-full' type='button'>
              {token && image ? (
                <Image alt='' className='rounded-full' height={32} src={image} width={32} />
              ) : (
                <span className='block size-8 rounded-full bg-muted-foreground' />
              )}
            </button>
          }
        />
        <PopoverContent className='mx-1 w-fit space-y-1 rounded-xl p-1.5'>
          <ThemeToggle />
          {token ? (
            <AlertDialog>
              <AlertDialogTrigger className='w-full' render={<Button variant='ghost' />}>
                Log out
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className='flex items-center gap-2'>
                    {image ? <Image alt='' className='rounded-full' height={24} src={image} width={24} /> : null}
                    {name}
                  </AlertDialogTitle>
                  <AlertDialogDescription>Log out of {email}?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <form
                    action={async () => {
                      'use server'
                      await fetchAction(api.auth.signOut, undefined, { token })
                      redirect('/login')
                    }}>
                    <Button>Continue</Button>
                  </form>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button asChild className='w-full' variant='ghost'>
              <Link href='/login'>Log in</Link>
            </Button>
          )}
        </PopoverContent>
      </Popover>
    )
  }

export default UserMenu
