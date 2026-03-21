'use client'
import type { ReactNode } from 'react'
import SharedPermissionGuard from '@a/shared/components/permission-guard'
type OrgRoleLike = 'admin' | 'member' | 'owner'
interface PermissionGuardProps {
  allowedRoles?: OrgRoleLike[]
  backHref: string
  backLabel: string
  canAccess?: boolean
  children: ReactNode
  className?: string
  resource: string
  role?: OrgRoleLike
}
const PermissionGuard = ({ allowedRoles, canAccess, role, ...props }: PermissionGuardProps) => {
  const effectiveRole = role,
    roleAllowed =
      allowedRoles && effectiveRole
        ? (allowedRoles as { includes: (value: OrgRoleLike) => boolean }).includes(effectiveRole)
        : allowedRoles
          ? false
          : undefined,
    canRender = canAccess ?? roleAllowed ?? true
  return <SharedPermissionGuard {...props} canAccess={canRender} />
}
export default PermissionGuard
