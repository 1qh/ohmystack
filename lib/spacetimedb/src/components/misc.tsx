'use client'
import { createMiscComponents } from '@a/shared/components/misc'
import { useSpacetimeDB } from 'spacetimedb/react'
const { OfflineIndicator, OrgAvatar, RoleBadge } = createMiscComponents({
  useOnlineStatus: () => {
    const { isActive } = useSpacetimeDB()
    return isActive
  }
})
export { OfflineIndicator, OrgAvatar, RoleBadge }
