'use client'

import { useAuthActions } from '@convex-dev/auth/react'
import { useConvexAuth } from 'convex/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const LoginPage = () => {
  const { signIn } = useAuthActions(),
    { isAuthenticated, isLoading } = useConvexAuth(),
    router = useRouter()

  const onGoogle = async () => {
    await signIn('google', { redirectTo: '/' })
  }

  useEffect(() => {
    if (isLoading || !isAuthenticated) return
    router.replace('/')
  }, [isAuthenticated, isLoading, router])

  return (
    <main className='flex min-h-screen items-center justify-center p-8'>
      <button className='rounded-lg bg-blue-600 px-6 py-3 text-white' onClick={onGoogle} type='button'>
        Continue with Google
      </button>
    </main>
  )
}

export default LoginPage
