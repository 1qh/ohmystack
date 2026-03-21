'use client'
import type { ComponentProps } from 'react'
import { OrgAvatar, RoleBadge as SharedRoleBadge, createOfflineIndicator } from '@a/shared/components/misc'
import { useSpacetimeDB } from 'spacetimedb/react'
import type { OrgRole } from '../server/types'

const useSpacetimeOnline = () => {
    const { isActive } = useSpacetimeDB()
    return isActive
  },
  RoleBadge = ({ role, ...props }: ComponentProps<typeof SharedRoleBadge> & { role: OrgRole }) => (
    <SharedRoleBadge role={role} {...props} />
  ),
  OfflineIndicator = createOfflineIndicator(useSpacetimeOnline)

export { OfflineIndicator, OrgAvatar, RoleBadge }
