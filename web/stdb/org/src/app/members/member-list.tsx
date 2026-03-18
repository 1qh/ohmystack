// biome-ignore-all lint/nursery/noFloatingPromises: event handler
/* eslint-disable @typescript-eslint/strict-void-return */
'use client'

import type { OrgMember } from '@a/be-spacetimedb/spacetimedb/types'

import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { Avatar, AvatarFallback, AvatarImage } from '@a/ui/avatar'
import { Button } from '@a/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@a/ui/dropdown-menu'
import { Input } from '@a/ui/input'
import { Skeleton } from '@a/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/table'
import { RoleBadge } from '@noboil/spacetimedb/components'
import { useMut, useSearch } from '@noboil/spacetimedb/react'
import { MoreHorizontal, Search, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { useSpacetimeDB } from 'spacetimedb/react'

import { useOrg } from '~/hook/use-org'
import { useOrgTable } from '~/hook/use-org-table'
import { useProfileMap } from '~/hook/use-profile-map'

const MemberList = () => {
  const { canManageAdmins, canManageMembers, org, role: myRole } = useOrg(),
    { identity } = useSpacetimeDB(),
    [memberRows, isReady] = useOrgTable<OrgMember>(tables.orgMember),
    profileByUserId = useProfileMap(),
    removeMember = useMut(reducers.orgRemoveMember, { toast: { success: 'Member removed' } }),
    setAdmin = useMut(reducers.orgSetAdmin, {
      toast: {
        success: (_result, args) => (args.isAdmin ? 'Promoted to admin' : 'Demoted to member')
      }
    }),
    [query, setQuery] = useState(''),
    members = memberRows.map(m => {
      const p = profileByUserId.get(m.userId.toHexString()),
        role: 'admin' | 'member' | 'owner' =
          m.userId.toHexString() === org.userId.toHexString() ? 'owner' : m.isAdmin ? 'admin' : 'member'
      return {
        memberId: m.id,
        name: p?.displayName ?? 'Unknown',
        role,
        user: p ? { image: p.avatar ?? null, name: p.displayName } : null,
        userId: m.userId.toHexString()
      }
    }),
    { results: filteredMembers } = useSearch(
      members,
      isReady,
      query.trim() ? { fields: ['name', 'role'], query } : 'skip'
    ),
    displayMembers = query.trim() ? filteredMembers : members

  if (!identity) return <Skeleton className='h-40 w-full' />

  return (
    <div className='flex flex-col gap-3'>
      <div className='relative'>
        <Search className='absolute top-2.5 left-2.5 size-4 text-muted-foreground' />
        <Input className='pl-9' onChange={e => setQuery(e.target.value)} placeholder='Search members...' value={query} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            {canManageMembers ? <TableHead className='w-10' /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayMembers.map(m => {
            const { memberId } = m,
              showActions = m.role !== 'owner'
            return (
              <TableRow key={m.userId}>
                <TableCell className='flex items-center gap-2'>
                  <Avatar className='size-8'>
                    {m.user?.image ? <AvatarImage src={m.user.image} /> : null}
                    <AvatarFallback>{m.user ? m.user.name.slice(0, 2).toUpperCase() : '??'}</AvatarFallback>
                  </Avatar>
                  <span>{m.user?.name ?? 'Unknown'}</span>
                </TableCell>
                <TableCell>
                  <RoleBadge role={m.role} />
                </TableCell>
                {canManageMembers ? (
                  <TableCell>
                    {showActions ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size='icon' variant='ghost'>
                            <MoreHorizontal className='size-4' />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          {canManageAdmins ? (
                            <DropdownMenuItem onSelect={async () => setAdmin({ isAdmin: m.role !== 'admin', memberId })}>
                              {m.role === 'admin' ? 'Demote to member' : 'Promote to admin'}
                            </DropdownMenuItem>
                          ) : null}
                          {(myRole === 'owner' || m.role === 'member') && (
                            <DropdownMenuItem
                              className='text-destructive'
                              onSelect={async () => removeMember({ memberId })}>
                              <UserMinus className='mr-2 size-4' />
                              Remove
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export default MemberList
