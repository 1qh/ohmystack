'use client'
import type { ComponentProps } from 'react'
import { cn } from '@a/ui'
import { Avatar, AvatarFallback, AvatarImage } from '@a/ui/avatar'
import { Badge } from '@a/ui/badge'
const OrgAvatar = ({ name, src, ...props }: ComponentProps<typeof Avatar> & { name: string; src?: string }) => (
    <Avatar {...props}>
      {src ? <AvatarImage src={src} /> : null}
      <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  ),
  variantByRole: Record<string, 'default' | 'outline' | 'secondary'> = {
    admin: 'secondary',
    member: 'outline',
    owner: 'default'
  },
  RoleBadge = ({ role, ...props }: ComponentProps<typeof Badge> & { role: string }) => (
    <Badge variant={variantByRole[role] ?? 'outline'} {...props}>
      {role}
    </Badge>
  ),
  createOfflineIndicator = (useOnlineStatus: () => boolean) => {
    const OfflineIndicator = ({ className, ...props }: ComponentProps<'p'>) => {
      const online = useOnlineStatus()
      if (online) return null
      return (
        <p
          className={cn(
            'fixed bottom-4 left-4 z-50 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-foreground shadow-lg',
            className
          )}
          {...props}>
          You are offline
        </p>
      )
    }
    OfflineIndicator.displayName = 'OfflineIndicator'
    return OfflineIndicator
  }
export { createOfflineIndicator, OrgAvatar, RoleBadge }
