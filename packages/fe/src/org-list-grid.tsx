'use client'

import type { ReactNode } from 'react'

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
  className?: string
  onSelect: (org: OrgListGridItem<TRole>) => void
  orgs: OrgListGridItem<TRole>[]
  renderAvatar: (org: OrgListGridItem<TRole>) => ReactNode
  renderRole: (role: TRole) => ReactNode
}

const OrgListGrid = <TRole extends string>({
  cardClassName,
  className,
  onSelect,
  orgs,
  renderAvatar,
  renderRole
}: OrgListGridProps<TRole>) => (
  <div className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-3', className)}>
    {orgs.map(o => (
      <Button
        className={cn(
          'h-auto justify-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted',
          cardClassName
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
