import type { ReactNode } from 'react'

const LoginLayout = ({ children }: { children: ReactNode }) => (
  <div className='flex h-screen w-screen items-center justify-center'>{children}</div>
)

export default LoginLayout
