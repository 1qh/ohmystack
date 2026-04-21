'use client'
import type { ComponentProps } from 'react'
import type { OrgRole } from '../server/types'
import { createOfflineIndicator, OrgAvatar, RoleBadge as SharedRoleBadge } from '../../shared/components/misc'
import useOnlineStatus from '../react/use-online-status'
const RoleBadge = ({ role, ...props }: ComponentProps<typeof SharedRoleBadge> & { role: OrgRole }) => (
  <SharedRoleBadge role={role} {...props} />
)
const OfflineIndicator = createOfflineIndicator(useOnlineStatus)
export { OfflineIndicator, OrgAvatar, RoleBadge }
