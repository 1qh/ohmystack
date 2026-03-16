import type { Popover as PopoverPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { api } from '@a/be-convex'
import { convexAuthNextjsToken as tok } from '@convex-dev/auth/nextjs/server'
import { fetchAction, fetchQuery } from 'convex/nextjs'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'

import UserMenuShell from './user-menu-shell'

const UserMenu = async ({ ...props }: ComponentProps<typeof PopoverPrimitive.Trigger>) => {
  await connection()
  const token = await tok(),
    { user } = api,
    profile = token
      ? ((await fetchQuery(user.me, {}, { token })) as { email?: string; image?: string; name?: string })
      : null,
    email = profile?.email,
    image = profile?.image,
    name = profile?.name

  const onLogout = async () => {
    'use server'
    await fetchAction(api.auth.signOut, undefined, { token })
    redirect('/login')
  }

  return (
    <UserMenuShell
      email={email}
      image={image}
      isSignedIn={Boolean(token)}
      name={name}
      onLogout={onLogout}
      triggerProps={props}
    />
  )
}

export default UserMenu
