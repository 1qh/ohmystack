/* eslint-disable @next/next/no-async-client-component */
/** biome-ignore-all lint/correctness/noNextAsyncClientComponent: render-only branch, no await */
/** biome-ignore-all lint/suspicious/useAwait: render-only branch, no await */
'use client'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@a/ui'
import { Badge } from '@a/ui/badge'
import { Button } from '@a/ui/button'
import Link from 'next/link'
const PermissionGuard = async ({
  backHref,
  backLabel,
  canAccess,
  children,
  className,
  resource,
  ...props
}: ComponentProps<'div'> & {
  backHref: string
  backLabel: string
  canAccess: boolean
  children: ReactNode
  resource: string
}) => {
  if (!canAccess)
    return (
      <div className={cn('flex flex-col items-center gap-4 py-12', className)} {...props}>
        <Badge variant='secondary'>View only</Badge>
        <p className='text-muted-foreground'>You don&apos;t have edit permission for this {resource}.</p>
        <Button nativeButton={false} render={p => <Link {...p} href={backHref} />} variant='outline'>
          Back to {backLabel}
        </Button>
      </div>
    )
  return children
}
export default PermissionGuard
