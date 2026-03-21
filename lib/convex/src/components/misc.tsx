'use client'
import { createMiscComponents } from '@a/shared/components/misc'
import useOnlineStatus from '../react/use-online-status'
const { OfflineIndicator, OrgAvatar, RoleBadge } = createMiscComponents({
  useOnlineStatus
})
export { OfflineIndicator, OrgAvatar, RoleBadge }
