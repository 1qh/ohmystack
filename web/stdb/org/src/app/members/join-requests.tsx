// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'
import type { OrgJoinRequest } from '@a/be-spacetimedb/spacetimedb/types'
import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { Avatar, AvatarFallback } from '@a/ui/avatar'
import { Button } from '@a/ui/button'
import { Switch } from '@a/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/table'
import { Check, X } from 'lucide-react'
import { useMut } from 'noboil/spacetimedb/react'
import { useState } from 'react'
import { useOrgTable } from '~/hook/use-org-table'
import { useProfileMap } from '~/hook/use-profile-map'
const JoinRequests = () => {
  const [orgRequests] = useOrgTable<OrgJoinRequest>(tables.orgJoinRequest)
  const requests = orgRequests.filter(r => r.status === 'pending').map(r => ({ request: r }))
  const approveRequest = useMut(reducers.orgApproveJoin, { toast: { success: 'Request approved' } })
  const rejectRequest = useMut(reducers.orgRejectJoin, { toast: { success: 'Request rejected' } })
  const [asAdmin, setAsAdmin] = useState<Record<string, boolean>>({})
  const profileByUserId = useProfileMap()
  if (requests.length === 0) return null
  return (
    <div className='space-y-2'>
      <h3 className='font-medium'>Join Requests</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Requested</TableHead>
            <TableHead>As Admin</TableHead>
            <TableHead className='w-20' />
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map(({ request: r }) => (
            <TableRow key={r.id}>
              <TableCell className='flex items-center gap-2'>
                <Avatar className='size-6'>
                  <AvatarFallback className='bg-foreground text-xs text-background'>
                    {(profileByUserId.get(r.userId.toHexString())?.displayName ?? '?').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <span>
                  {profileByUserId.get(r.userId.toHexString())?.displayName ?? r.userId.toHexString().slice(0, 8)}
                </span>
              </TableCell>
              <TableCell className='max-w-48 truncate text-sm text-muted-foreground'>{r.message ?? '-'}</TableCell>
              <TableCell className='text-sm text-muted-foreground'>{r.createdAt.toDate().toLocaleDateString()}</TableCell>
              <TableCell>
                <Switch
                  checked={asAdmin[`${r.id}`] ?? false}
                  onCheckedChange={v => setAsAdmin(prev => ({ ...prev, [`${r.id}`]: v }))}
                />
              </TableCell>
              <TableCell className='flex gap-1'>
                <Button
                  onClick={() => {
                    approveRequest({ isAdmin: asAdmin[`${r.id}`] ?? false, requestId: r.id })
                  }}
                  size='icon'
                  variant='ghost'>
                  <Check className='size-4 text-primary' />
                </Button>
                <Button
                  onClick={() => {
                    rejectRequest({ requestId: r.id })
                  }}
                  size='icon'
                  variant='ghost'>
                  <X className='size-4 text-destructive' />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
export default JoinRequests
