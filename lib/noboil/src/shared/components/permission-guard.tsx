import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@a/ui'
import { Badge } from '@a/ui/badge'
import { Button } from '@a/ui/button'
import Link from 'next/link'
interface PermissionGuardProps extends ComponentProps<'div'> {
  backHref: string
  backLabel: string
  canAccess: boolean
  children: ReactNode
  resource: string
}
const PermissionGuard = (props: PermissionGuardProps): ReactNode => {
  const { backHref, backLabel, canAccess, children, className, resource, ...rest } = props
  if (canAccess) return children
  return (
    <div className={cn('flex flex-col items-center gap-4 py-12', className)} {...rest}>
      <Badge variant='secondary'>View only</Badge>
      <p className='text-muted-foreground'>You don&apos;t have edit permission for this {resource}.</p>
      <Button nativeButton={false} render={p => <Link {...p} href={backHref} />} variant='outline'>
        Back to {backLabel}
      </Button>
    </div>
  )
}
export default PermissionGuard
