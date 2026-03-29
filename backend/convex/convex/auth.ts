/* eslint-disable @typescript-eslint/require-await */
import Google from '@auth/core/providers/google'
import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'
export const { auth, isAuthenticated, signIn, signOut, store } = convexAuth({
  callbacks: {
    redirect: async ({ redirectTo }) => (redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/')
  },
  providers: [Google, Password]
})
