/* eslint-disable @typescript-eslint/promise-function-async */
'use client'
import type { ComponentProps, ReactNode } from 'react'
import SharedPermissionGuard from '@a/shared/components/permission-guard'
import type { OrgRole } from '../server/types'

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
  const roleAllowed = allowedRoles && role ? allowedRoles.includes(role) : allowedRoles ? false : undefined,
    resolvedAccess = canAccess ?? roleAllowed ?? true
  return <SharedPermissionGuard canAccess={resolvedAccess} {...props} />
}

export default PermissionGuard
