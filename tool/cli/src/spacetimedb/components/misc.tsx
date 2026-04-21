'use client'
import type { ComponentProps } from 'react'
import { useSpacetimeDB } from 'spacetimedb/react'
import type { OrgRole } from '../server/types'
import { createOfflineIndicator, OrgAvatar, RoleBadge as SharedRoleBadge } from '../../shared/components/misc'
const useSpacetimeOnline = () => {
  const { isActive } = useSpacetimeDB()
  return isActive
}
const RoleBadge = ({ role, ...props }: ComponentProps<typeof SharedRoleBadge> & { role: OrgRole }) => (
  <SharedRoleBadge role={role} {...props} />
)
const OfflineIndicator = createOfflineIndicator(useSpacetimeOnline)
export { OfflineIndicator, OrgAvatar, RoleBadge }
