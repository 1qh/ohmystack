import type { Popover as PopoverPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

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
import { cookies } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import env from './env'
import ThemeToggle from './theme-toggle'

interface UserInfo {
  email?: string
  image?: string
  name?: string
}

const toHttpUri = (uri: string) => {
    if (uri.startsWith('wss://')) return uri.replace('wss://', 'https://')
    if (uri.startsWith('ws://')) return uri.replace('ws://', 'http://')
    return uri
  },
  isObject = (val: unknown): val is Record<string, unknown> => typeof val === 'object' && val !== null,
  readString = (val: unknown) => (typeof val === 'string' && val.length > 0 ? val : undefined),
  getFirstRow = (payload: unknown): UserInfo => {
    if (!Array.isArray(payload)) return {}
    const first: unknown = payload.length > 0 ? payload[0] : undefined
    if (!isObject(first)) return {}
    return {
      email: readString(first.email),
      image: readString(first.image),
      name: readString(first.name)
    }
  },
  readUserFromSql = async (token: string): Promise<UserInfo> => {
    const baseUri = toHttpUri(env.NEXT_PUBLIC_SPACETIMEDB_URI),
      moduleName = env.SPACETIMEDB_MODULE_NAME,
      response = await fetch(`${baseUri}/v1/database/${moduleName}/sql`, {
        body: JSON.stringify({ query: 'select email, image, name from user_profile limit 1' }),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        method: 'POST'
      })
    if (!response.ok) return {}
    const body = (await response.json()) as unknown
    return getFirstRow(body)
  },
  UserMenu = async ({ ...props }: ComponentProps<typeof PopoverPrimitive.Trigger>) => {
    const token = (await cookies()).get('spacetimedb_token')?.value,
      { email, image, name } = token ? await readUserFromSql(token) : {}
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
                      const store = await cookies()
                      store.delete('spacetimedb_token')
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
