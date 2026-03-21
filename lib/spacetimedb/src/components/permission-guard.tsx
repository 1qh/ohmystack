/* eslint-disable @typescript-eslint/promise-function-async */
'use client'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@a/ui'
import { Badge } from '@a/ui/badge'
import { Button } from '@a/ui/button'
import Link from 'next/link'
import type { OrgRole } from '../server/types'
/** Conditionally renders children based on org role or edit permission. */
const PermissionGuard = ({
  allowedRoles,
  backHref,
  backLabel,
  canAccess,
  children,
  className,
  resource,
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
  const effectiveRole = role,
    roleAllowed = allowedRoles && effectiveRole ? allowedRoles.includes(effectiveRole) : allowedRoles ? false : undefined,
    canRender = canAccess ?? roleAllowed ?? true
  if (!canRender)
    return (
      <div className={cn('flex flex-col items-center gap-4 py-12', className)} {...props}>
        <Badge variant='secondary'>View only</Badge>
        <p className='text-muted-foreground'>You don&apos;t have edit permission for this {resource}.</p>
        <Button asChild variant='outline'>
          <Link href={backHref}>Back to {backLabel}</Link>
        </Button>
      </div>
    )
  return children
}
export default PermissionGuard
