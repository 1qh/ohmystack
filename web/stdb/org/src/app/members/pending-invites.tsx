/* eslint-disable @typescript-eslint/strict-void-return */
// biome-ignore-all lint/nursery/useGlobalThis: browser API
// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'

import type { OrgInvite } from '@a/be-spacetimedb/spacetimedb/types'

import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { formatExpiry } from '@a/fe/utils'
import { Button } from '@a/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/table'
import { RoleBadge } from '@noboil/spacetimedb/components'
import { useMut, useMutate } from '@noboil/spacetimedb/react'
import { Copy, Trash } from 'lucide-react'

import { useOrgTable } from '~/hook/use-org-table'

const PendingInvites = () => {
  const [invites] = useOrgTable<OrgInvite>(tables.orgInvite),
    revokeInvite = useMut(reducers.orgRevokeInvite, { toast: { success: 'Invite revoked' } }),
    copyInviteLink = useMutate(
      async ({ token }: { token: string }) => {
        const url = `${window.location.origin}/invite/${token}`
        await navigator.clipboard.writeText(url)
      },
      { toast: { error: 'Failed to copy', success: 'Invite link copied' } }
    )

  if (invites.length === 0) return null

  return (
    <div className='space-y-2'>
      <h3 className='font-medium'>Pending Invites</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className='w-20' />
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.map(i => (
            <TableRow key={i.id}>
              <TableCell>{i.email}</TableCell>
              <TableCell>
                <RoleBadge role={i.isAdmin ? 'admin' : 'member'} />
              </TableCell>
              <TableCell className='text-sm text-muted-foreground'>{formatExpiry(i.expiresAt)}</TableCell>
              <TableCell className='flex gap-1'>
                <Button onClick={async () => copyInviteLink({ token: i.token })} size='icon' variant='ghost'>
                  <Copy className='size-4' />
                </Button>
                <Button
                  onClick={() => {
                    revokeInvite({ inviteId: i.id })
                  }}
                  size='icon'
                  variant='ghost'>
                  <Trash className='size-4' />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default PendingInvites
