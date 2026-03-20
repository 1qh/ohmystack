import type { Popover as PopoverPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import env from './env'
import UserMenuShell from './user-menu-shell'
interface UserInfo {
  email?: string
  image?: string
  name?: string
}
interface UserMenuProps extends ComponentProps<typeof PopoverPrimitive.Trigger> {
  shellProps?: Omit<
    ComponentProps<typeof UserMenuShell>,
    'email' | 'image' | 'isSignedIn' | 'name' | 'onLogout' | 'triggerProps'
  >
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
  UserMenu = async ({ shellProps, ...triggerProps }: UserMenuProps) => {
    const cookieStore = await cookies(),
      token = cookieStore.get('spacetimedb_token')?.value,
      profile = token ? await readUserFromSql(token) : null,
      email = profile?.email,
      image = profile?.image,
      name = profile?.name,
      onLogout = async () => {
        'use server'
        const store = await cookies()
        store.delete('spacetimedb_token')
        redirect('/login')
      }
    return (
      <UserMenuShell
        {...shellProps}
        email={email}
        image={image}
        isSignedIn={Boolean(token)}
        name={name}
        onLogout={onLogout}
        triggerProps={triggerProps}
      />
    )
  }
export default UserMenu
