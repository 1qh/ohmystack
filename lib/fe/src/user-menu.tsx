import type { PopoverTrigger } from '@a/ui/popover'
import type { ComponentProps } from 'react'
import { api } from '@a/be-convex'
import { convexAuthNextjsToken as tok } from '@convex-dev/auth/nextjs/server'
import { fetchQuery } from 'convex/nextjs'
import { connection } from 'next/server'
import { logoutAction } from './logout-action'
import UserMenuShell from './user-menu-shell'
interface UserMenuProps extends ComponentProps<typeof PopoverTrigger> {
  shellProps?: Omit<
    ComponentProps<typeof UserMenuShell>,
    'email' | 'image' | 'isSignedIn' | 'name' | 'onLogout' | 'triggerProps'
  >
}
const UserMenu = async ({ shellProps, ...triggerProps }: UserMenuProps) => {
  await connection()
  const token = await tok()
  const { user } = api
  const profile = token
    ? ((await fetchQuery(user.me, {}, { token })) as { email?: string; image?: string; name?: string })
    : null
  const email = profile?.email
  const image = profile?.image
  const name = profile?.name
  return (
    <UserMenuShell
      {...shellProps}
      email={email}
      image={image}
      isSignedIn={Boolean(token)}
      name={name}
      onLogout={logoutAction}
      triggerProps={triggerProps}
    />
  )
}
export default UserMenu
