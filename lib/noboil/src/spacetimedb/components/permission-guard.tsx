'use client'
import type { ComponentProps, ReactNode } from 'react'
import type { OrgRole } from '../server/types'
import SharedPermissionGuard from '../../shared/components/permission-guard'
const PermissionGuard = ({
  allowedRoles,
  canAccess,
  role,
  ...props
}: ComponentProps<'div'> & {
  allowedRoles?: OrgRole[]
  backHref: string
  backLabel: string
  canAccess?: boolean
  children: ReactNode
  resource: string
  role?: OrgRole
}) => {
  const roleAllowed = allowedRoles && role ? allowedRoles.includes(role) : allowedRoles ? false : undefined
  const resolvedAccess = canAccess ?? roleAllowed ?? true
  return <SharedPermissionGuard canAccess={resolvedAccess} {...props} />
}
export default PermissionGuard
