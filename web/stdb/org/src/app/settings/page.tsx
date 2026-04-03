/* eslint-disable no-alert */
/** biome-ignore-all lint/suspicious/noAlert: demo page uses native confirm */
// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'
import type { OrgMember } from '@a/be-spacetimedb/spacetimedb/types'
import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@a/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@a/ui/select'
import { clearActiveOrgCookie } from '@noboil/spacetimedb/next'
import { useMutate } from '@noboil/spacetimedb/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useReducer } from 'spacetimedb/react'
import { useOrg, useOrgMutation } from '~/hook/use-org'
import { useOrgTable } from '~/hook/use-org-table'
import { useProfileMap } from '~/hook/use-profile-map'
import OrgSettingsForm from './org-settings-form'
const OrgSettingsPage = () => {
  const router = useRouter()
  const clearAndGoHome = async () => {
    await clearActiveOrgCookie()
    router.push('/')
  }
  const orgTransferOwnership = useOrgMutation(useReducer(reducers.orgTransferOwnership))
  const { canDeleteOrg, isAdmin, isOwner, org } = useOrg()
  const removeOrg = useMutate(useOrgMutation(useReducer(reducers.orgRemove)), {
    onSuccess: () => {
      clearAndGoHome()
    },
    toast: { success: 'Organization deleted' }
  })
  const leaveOrg = useMutate(useOrgMutation(useReducer(reducers.orgLeave)), {
    onSuccess: () => {
      clearAndGoHome()
    },
    toast: { success: 'You have left the organization' }
  })
  const transferOwnership = useMutate(
    // biome-ignore lint/suspicious/useAwait: callback shape comes from useMutate
    async (args: Record<string, unknown>) => {
      const newOwnerId = args.newOwnerId as NonNullable<Parameters<typeof orgTransferOwnership>[0]>['newOwnerId']
      return orgTransferOwnership({ newOwnerId })
    },
    {
      onSuccess: () => router.refresh(),
      toast: { success: 'Ownership transferred' }
    }
  )
  const [members] = useOrgTable<OrgMember>(tables.orgMember)
  const [transferTarget, setTransferTarget] = useState('')
  const profileByUserId = useProfileMap()
  if (!isAdmin)
    return <div className='text-center text-muted-foreground'>You do not have permission to access settings.</div>
  const adminMembers = members.filter(m => m.isAdmin)
  const handleLeave = () => {
    if (!confirm('Are you sure you want to leave this organization?')) return
    leaveOrg({})
  }
  const handleTransfer = () => {
    const target = adminMembers.find(m => m.userId.toHexString() === transferTarget)
    if (!target) return
    if (!confirm('Are you sure? You will become an admin and lose owner privileges.')) return
    transferOwnership({ newOwnerId: target.userId })
  }
  const handleDelete = () => {
    if (!confirm('Are you sure? This will delete all data.')) return
    removeOrg({})
  }
  return (
    <div className='space-y-6'>
      <h1 className='text-2xl font-bold'>Settings</h1>
      <OrgSettingsForm org={org} />
      {isOwner && adminMembers.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Transfer Ownership</CardTitle>
            <CardDescription>Transfer ownership to an admin. You will become an admin.</CardDescription>
          </CardHeader>
          <CardContent className='flex gap-2'>
            <Select
              onValueChange={(v: null | string) => {
                if (v) setTransferTarget(v)
              }}
              value={transferTarget}>
              <SelectTrigger className='w-64'>
                <SelectValue placeholder='Select an admin' />
              </SelectTrigger>
              <SelectContent>
                {adminMembers.map(m => {
                  const hex = m.userId.toHexString()
                  const profile = profileByUserId.get(hex)
                  return (
                    <SelectItem key={m.id} value={hex}>
                      {profile?.displayName ?? hex.slice(0, 8)}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <Button disabled={!transferTarget} onClick={handleTransfer} variant='outline'>
              Transfer
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {isOwner ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Leave Organization</CardTitle>
            <CardDescription>Remove yourself from this organization.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleLeave} variant='outline'>
              Leave organization
            </Button>
          </CardContent>
        </Card>
      )}
      {canDeleteOrg ? (
        <Card className='border-destructive'>
          <CardHeader>
            <CardTitle className='text-destructive'>Danger zone</CardTitle>
            <CardDescription>Permanently delete this organization and all its data.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleDelete} variant='destructive'>
              Delete organization
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
export default OrgSettingsPage
