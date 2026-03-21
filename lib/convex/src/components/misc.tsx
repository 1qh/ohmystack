'use client'
import type { ComponentProps } from 'react'
import { OrgAvatar, RoleBadge as SharedRoleBadge, createOfflineIndicator } from '@a/shared/components/misc'
import type { OrgRole } from '../server/types'
import useOnlineStatus from '../react/use-online-status'

const RoleBadge = ({ role, ...props }: ComponentProps<typeof SharedRoleBadge> & { role: OrgRole }) => (
    <SharedRoleBadge role={role} {...props} />
  ),
  OfflineIndicator = createOfflineIndicator(useOnlineStatus)

export { OfflineIndicator, OrgAvatar, RoleBadge }
