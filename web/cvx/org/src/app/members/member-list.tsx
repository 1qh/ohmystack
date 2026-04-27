/* oxlint-disable promise/prefer-await-to-then */
/* oxlint-disable forbid-component-props -- shadcn/Tailwind pattern requires className/style on shared components */
/* oxlint-disable eslint-plugin-react(forbid-component-props) */
'use client'
import { api } from '@a/be-convex'
import { fail } from '@a/fe/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@a/ui/avatar'
import { Button } from '@a/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@a/ui/dropdown-menu'
import { Input } from '@a/ui/input'
import { Skeleton } from '@a/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/table'
import { useMutation } from 'convex/react'
import { MoreHorizontal, Search, UserMinus } from 'lucide-react'
import { RoleBadge } from 'noboil/convex/components'
import { useOrgQuery } from 'noboil/convex/react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useOrg } from '~/hook/use-org'
const MemberList = () => {
  const { canManageAdmins, canManageMembers, role: myRole } = useOrg()
  const members = useOrgQuery(api.org.members)
  const removeMember = useMutation(api.org.removeMember)
  const setAdmin = useMutation(api.org.setAdmin)
  const [query, setQuery] = useState('')
  const displayMembers = useMemo(() => {
    if (!members) return []
    const q = query.trim().toLowerCase()
    if (!q) return members
    const out: typeof members = []
    for (const m of members)
      if (m.role.toLowerCase().includes(q) || (m.user?.name ?? '').toLowerCase().includes(q)) out.push(m)
    return out
  }, [members, query])
  if (!members) return <Skeleton className='h-40 w-full' />
  type MemberId = NonNullable<(typeof members)[number]['memberId']>
  const handleRemove = (memberId: MemberId) => {
    removeMember({ memberId })
      .then(() => toast.success('Member removed'))
      .catch(fail)
  }
  const handleToggleAdmin = (memberId: MemberId, isAdmin: boolean) => {
    setAdmin({ isAdmin: !isAdmin, memberId })
      .then(() => toast.success(isAdmin ? 'Demoted to member' : 'Promoted to admin'))
      .catch(fail)
  }
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
            const { memberId } = m
            const showActions = m.role !== 'owner' && memberId
            return (
              <TableRow key={m.userId}>
                <TableCell className='flex items-center gap-2'>
                  <Avatar className='size-8'>
                    {m.user?.image ? <AvatarImage src={m.user.image} /> : null}
                    <AvatarFallback className='bg-foreground text-background'>
                      {m.user?.name?.slice(0, 2).toUpperCase() ?? '??'}
                    </AvatarFallback>
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
                        <DropdownMenuTrigger render={p => <Button {...p} size='icon' variant='ghost' />}>
                          <MoreHorizontal className='size-4' />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          {canManageAdmins ? (
                            <DropdownMenuItem onSelect={() => handleToggleAdmin(memberId, m.role === 'admin')}>
                              {m.role === 'admin' ? 'Demote to member' : 'Promote to admin'}
                            </DropdownMenuItem>
                          ) : null}
                          {(myRole === 'owner' || m.role === 'member') && (
                            <DropdownMenuItem className='text-destructive' onSelect={() => handleRemove(memberId)}>
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
