'use client'

import type { ComponentProps, ComponentType } from 'react'

import { cn } from '@a/ui'

interface MembersPageShellProps<TOrgId extends string> {
  canManageMembers: boolean
  className?: string
  contentClassName?: string
  contentProps?: Omit<ComponentProps<'div'>, 'children'>
  headerClassName?: string
  headerProps?: Omit<ComponentProps<'div'>, 'children'>
  InviteDialog: ComponentType<{ orgId: TOrgId }>
  JoinRequests: ComponentType
  MemberList: ComponentType
  orgId: TOrgId
  PendingInvites: ComponentType
  title?: string
  titleProps?: Omit<ComponentProps<'h1'>, 'children'>
  wrapperProps?: Omit<ComponentProps<'div'>, 'children'>
}

const MembersPageShell = <TOrgId extends string>({
  canManageMembers,
  className,
  contentClassName,
  contentProps,
  headerClassName,
  headerProps,
  InviteDialog,
  JoinRequests,
  MemberList,
  orgId,
  PendingInvites,
  title = 'Members',
  titleProps,
  wrapperProps
}: MembersPageShellProps<TOrgId>) => (
  <div {...wrapperProps} className={cn('space-y-6', className, wrapperProps?.className)}>
    <div {...headerProps} className={cn('flex items-center justify-between', headerClassName, headerProps?.className)}>
      <h1 {...titleProps} className={cn('text-2xl font-bold', titleProps?.className)}>
        {title}
      </h1>
      {canManageMembers ? <InviteDialog orgId={orgId} /> : null}
    </div>
    <div {...contentProps} className={cn('space-y-6', contentClassName, contentProps?.className)}>
      <MemberList />
      {canManageMembers ? <PendingInvites /> : null}
      {canManageMembers ? <JoinRequests /> : null}
    </div>
  </div>
)

export type { MembersPageShellProps }
export default MembersPageShell
