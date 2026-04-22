import type { PopoverTrigger } from '@a/ui/popover'
import type { ComponentProps } from 'react'
import { urls } from '@a/config'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { queryTable } from 'noboil/spacetimedb/next'
import env from './env'
import UserMenuShell from './user-menu-shell'
interface UserInfo {
  email?: string
  image?: string
  name?: string
}
interface UserMenuProps extends ComponentProps<typeof PopoverTrigger> {
  shellProps?: Omit<
    ComponentProps<typeof UserMenuShell>,
    'email' | 'image' | 'isSignedIn' | 'name' | 'onLogout' | 'triggerProps'
  >
}
const toHttpUri = (uri: string | undefined) => {
  const resolved = uri ?? urls().stdbWs
  if (resolved.startsWith('wss://')) return resolved.replace('wss://', 'https://')
  if (resolved.startsWith('ws://')) return resolved.replace('ws://', 'http://')
  return resolved
}
const readUserProfile = async (token: string): Promise<UserInfo> => {
  const { rows } = await queryTable<UserInfo>({
    columns: ['email', 'image', 'name'],
    limit: 1,
    moduleName: env.SPACETIMEDB_MODULE_NAME,
    table: 'user_profile',
    token,
    uri: toHttpUri(env.NEXT_PUBLIC_SPACETIMEDB_URI)
  })
  return rows[0] ?? {}
}
const UserMenu = async ({ shellProps, ...triggerProps }: UserMenuProps) => {
  const cookieStore = await cookies()
  const token = cookieStore.get('spacetimedb_token')?.value
  const profile = token ? await readUserProfile(token) : null
  const email = profile?.email
  const image = profile?.image
  const name = profile?.name
  const onLogout = async () => {
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
