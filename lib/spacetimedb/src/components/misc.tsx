'use client'
import type { ComponentProps } from 'react'
import { createOfflineIndicator, OrgAvatar, RoleBadge as SharedRoleBadge } from '@noboil/shared/components/misc'
import { useSpacetimeDB } from 'spacetimedb/react'
import type { OrgRole } from '../server/types'
const useSpacetimeOnline = () => {
  const { isActive } = useSpacetimeDB()
  return isActive
}
const RoleBadge = ({ role, ...props }: ComponentProps<typeof SharedRoleBadge> & { role: OrgRole }) => (
  <SharedRoleBadge role={role} {...props} />
)
const OfflineIndicator = createOfflineIndicator(useSpacetimeOnline)
export { OfflineIndicator, OrgAvatar, RoleBadge }
