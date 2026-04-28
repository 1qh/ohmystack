'use client'
/* oxlint-disable eslint(no-underscore-dangle) */
import { Button } from '@a/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@a/ui/dropdown-menu'
import { Skeleton } from '@a/ui/skeleton'
import { ChevronDown, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { OrgAvatar, RoleBadge } from 'noboil/spacetimedb/components'
import { resolveFileUrl, setActiveOrgCookieClient, useFiles } from 'noboil/spacetimedb/react'
import { useActiveOrg, useMyOrgs } from '~/hook/use-org'
const OrgSwitcher = () => {
  const router = useRouter()
  const { activeOrg, isLoading: activeLoading } = useActiveOrg()
  const { isLoading: orgsLoading, orgs } = useMyOrgs()
  const files = useFiles()
  const resolve = (id: string | undefined) => (id ? (resolveFileUrl(files, id) ?? undefined) : undefined)
  if (activeLoading || orgsLoading) return <Skeleton className='h-9 w-32' />
  const handleSwitch = (org: (typeof orgs)[number]) => {
    setActiveOrgCookieClient({ orgId: org.org._id, slug: org.org.slug })
    router.push('/dashboard')
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={p => <Button {...p} className='gap-2' variant='outline' />}>
        {activeOrg ? (
          <>
            <OrgAvatar
              name={activeOrg.name}
              size='sm'
              src={activeOrg.avatarId ? resolve(activeOrg.avatarId) : undefined}
            />
            <span className='max-w-24 truncate'>{activeOrg.name}</span>
          </>
        ) : (
          <span>Select org</span>
        )}
        <ChevronDown className='size-4' />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start'>
        {orgs.map(item => (
          <DropdownMenuItem className='gap-2' key={item.org._id} onSelect={() => handleSwitch(item)}>
            <OrgAvatar name={item.org.name} size='sm' src={item.org.avatarId ? resolve(item.org.avatarId) : undefined} />
            <span className='flex-1 truncate'>{item.org.name}</span>
            <RoleBadge role={item.role} />
          </DropdownMenuItem>
        ))}
        {orgs.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => router.push('/new')}>
          <Plus className='mr-2 size-4' />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
export default OrgSwitcher
