/* oxlint-disable promise/prefer-await-to-then, promise/always-return */
/* eslint-disable no-alert */
/* oxlint-disable forbid-component-props -- shadcn/Tailwind pattern requires className/style on shared components */
/* oxlint-disable eslint-plugin-react(forbid-component-props) */
'use client'
import { api } from '@a/be-convex'
import { fail } from '@a/fe/utils'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@a/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@a/ui/select'
import { useRouter } from 'next/navigation'
import { clearActiveOrgCookie } from 'noboil/convex/next'
import { useOrgMutation, useOrgQuery } from 'noboil/convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useOrg } from '~/hook/use-org'
import OrgSettingsForm from './org-settings-form'
const OrgSettingsPage = () => {
  const router = useRouter()
  const { canDeleteOrg, isAdmin, isOwner, org } = useOrg()
  const removeOrg = useOrgMutation(api.org.remove)
  const leaveOrg = useOrgMutation(api.org.leave)
  const transferOwnership = useOrgMutation(api.org.transferOwnership)
  const members = useOrgQuery(api.org.members)
  const [transferTarget, setTransferTarget] = useState('')
  if (!isAdmin)
    return <div className='text-center text-muted-foreground'>You do not have permission to access settings.</div>
  const adminMembers = members?.filter(m => m.role === 'admin') ?? []
  const handleLeave = () => {
    /** biome-ignore lint/suspicious/noAlert: demo page uses native confirm */
    if (!confirm('Are you sure you want to leave this organization?')) return
    leaveOrg()
      .then(async () => {
        await clearActiveOrgCookie()
        toast.success('You have left the organization')
        router.push('/')
      })
      .catch(fail)
  }
  const handleTransfer = () => {
    const target = adminMembers.find(m => m.userId === transferTarget)
    if (!target) return
    /** biome-ignore lint/suspicious/noAlert: demo page uses native confirm */
    if (!confirm('Are you sure? You will become an admin and lose owner privileges.')) return
    transferOwnership({ newOwnerId: target.userId })
      .then(() => {
        toast.success('Ownership transferred')
        router.refresh()
      })
      .catch(fail)
  }
  const handleDelete = () => {
    /** biome-ignore lint/suspicious/noAlert: demo page uses native confirm */
    if (!confirm('Are you sure? This will delete all data.')) return
    removeOrg()
      .then(async () => {
        await clearActiveOrgCookie()
        toast.success('Organization deleted')
        router.push('/')
      })
      .catch(fail)
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
                {adminMembers.map(m => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.user?.name ?? m.user?.email ?? 'Unknown'}
                  </SelectItem>
                ))}
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
            <Button
              className='!text-destructive-foreground border-destructive! bg-destructive! hover:bg-destructive/90! focus-visible:border-destructive! focus-visible:ring-destructive! dark:bg-destructive! dark:hover:bg-destructive/90!'
              onClick={handleDelete}
              variant='destructive'>
              Delete organization
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
export default OrgSettingsPage
