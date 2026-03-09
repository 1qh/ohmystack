'use client'

import type { ComponentProps } from 'react'

import { cn } from '@a/ui'
import { Avatar, AvatarFallback, AvatarImage } from '@a/ui/avatar'
import { Badge } from '@a/ui/badge'

import type { OrgRole } from '../server/types'

import useOnlineStatus from '../react/use-online-status'

const OrgAvatar = ({ name, src, ...props }: ComponentProps<typeof Avatar> & { name: string; src?: string }) => (
    <Avatar {...props}>
      {src ? <AvatarImage src={src} /> : null}
      <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  ),
  variants: Record<OrgRole, 'default' | 'outline' | 'secondary'> = {
    admin: 'secondary',
    member: 'outline',
    owner: 'default'
  },
  RoleBadge = ({ role, ...props }: ComponentProps<typeof Badge> & { role: OrgRole }) => (
    <Badge variant={variants[role]} {...props}>
      {role}
    </Badge>
  ),
  OfflineIndicator = ({ className, ...props }: ComponentProps<'p'>) => {
    const online = useOnlineStatus()
    if (online) return null
    return (
      <p
        className={cn(
          'fixed bottom-4 left-4 z-50 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-lg',
          className
        )}
        {...props}>
        You are offline
      </p>
    )
  }

/** Exports OrgAvatar, RoleBadge, and OfflineIndicator components. */
export { OfflineIndicator, OrgAvatar, RoleBadge }
