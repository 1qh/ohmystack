'use server'
import { api } from '@a/be-convex'
import { convexAuthNextjsToken as tok } from '@convex-dev/auth/nextjs/server'
import { fetchAction } from 'convex/nextjs'
import { redirect } from 'next/navigation'
const logoutAction = async () => {
  const token = await tok()
  await fetchAction(api.auth.signOut, undefined, { token })
  redirect('/login')
}
export { logoutAction }
