import Google from '@auth/core/providers/google'
import { convexAuth } from '@convex-dev/auth/server'
// oxlint-disable-next-line import/no-unassigned-import
import '../env'
const { auth, isAuthenticated, signIn, signOut, store } = convexAuth({
  providers: [Google]
})
export { auth, isAuthenticated, signIn, signOut, store }
