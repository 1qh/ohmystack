import type { ReactNode } from 'react'

import { cn } from '@a/rnr'
import { View } from 'react-native'

interface LoginLayoutProps {
  children: ReactNode
  className?: string
}

const LoginLayout = ({ children, className }: LoginLayoutProps) => (
  <View className={cn('flex-1 items-center justify-center', className)}>{children}</View>
)

export default LoginLayout
