/* oxlint-disable promise/prefer-await-to-then */
'use client'

import { api } from '@a/be-convex'
import { fail, formatExpiry } from '@a/fe/utils'
import { Button } from '@a/ui/button'
import { Skeleton } from '@a/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/table'
import { RoleBadge } from '@noboil/convex/components'
import { useOrgQuery } from '@noboil/convex/react'
import { useMutation } from 'convex/react'
import { Copy, Trash } from 'lucide-react'
import { toast } from 'sonner'

const PendingInvites = () => {
  const invites = useOrgQuery(api.org.pendingInvites),
    revokeInvite = useMutation(api.org.revokeInvite)

  if (invites === undefined) return <Skeleton className='h-20 w-full' />
  if (invites.length === 0) return null

  const handleCopy = (token: string) => {
      const url = `${globalThis.location.origin}/invite/${token}`
      navigator.clipboard
        .writeText(url)
        .then(() => toast.success('Invite link copied'))
        .catch(() => toast.error('Failed to copy'))
    },
    handleRevoke = (inviteId: (typeof invites)[number]['_id']) => {
      revokeInvite({ inviteId })
        .then(() => toast.success('Invite revoked'))
        .catch(fail)
    }

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
            <TableRow key={i._id}>
              <TableCell>{i.email}</TableCell>
              <TableCell>
                <RoleBadge role={i.isAdmin ? 'admin' : 'member'} />
              </TableCell>
              <TableCell className='text-sm text-muted-foreground'>{formatExpiry(i.expiresAt)}</TableCell>
              <TableCell className='flex gap-1'>
                <Button onClick={() => handleCopy(i.token)} size='icon' variant='ghost'>
                  <Copy className='size-4' />
                </Button>
                <Button onClick={() => handleRevoke(i._id)} size='icon' variant='ghost'>
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
