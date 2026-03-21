'use client'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@a/ui'
import { Button } from '@a/ui/button'
interface OrgListGridItem<TRole extends string> {
  avatarId?: null | string
  id: string
  name: string
  role: TRole
  slug: string
}
interface OrgListGridProps<TRole extends string> {
  cardClassName?: string
  cardProps?: Omit<ComponentProps<typeof Button>, 'children' | 'onClick' | 'type'>
  className?: string
  onSelect: (org: OrgListGridItem<TRole>) => void
  orgs: OrgListGridItem<TRole>[]
  renderAvatar: (org: OrgListGridItem<TRole>) => ReactNode
  renderRole: (role: TRole) => ReactNode
  rootProps?: Omit<ComponentProps<'div'>, 'children'>
}
const OrgListGrid = <TRole extends string>({
  cardClassName,
  cardProps,
  className,
  onSelect,
  orgs,
  renderAvatar,
  renderRole,
  rootProps
}: OrgListGridProps<TRole>) => (
  <div {...rootProps} className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-3', className, rootProps?.className)}>
    {orgs.map(o => (
      <Button
        {...cardProps}
        className={cn(
          'h-auto justify-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted',
          cardClassName,
          cardProps?.className
        )}
        key={o.id}
        onClick={() => {
          onSelect(o)
        }}
        type='button'
        variant='ghost'>
        {renderAvatar(o)}
        <div className='flex-1'>
          <div className='font-medium'>{o.name}</div>
          <div className='text-sm text-muted-foreground'>/{o.slug}</div>
        </div>
        {renderRole(o.role)}
      </Button>
    ))}
  </div>
)
export type { OrgListGridItem, OrgListGridProps }
export default OrgListGrid
