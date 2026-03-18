'use client'

import { Button } from '@a/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@a/ui/dropdown-menu'
import { Skeleton } from '@a/ui/skeleton'
import { OrgAvatar, RoleBadge } from '@noboil/convex/components'
import { setActiveOrgCookieClient } from '@noboil/convex/react'
import { ChevronDown, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { useActiveOrg, useMyOrgs } from '~/hook/use-org'

const OrgSwitcher = () => {
  const router = useRouter(),
    { activeOrg, isLoading: activeLoading } = useActiveOrg(),
    { isLoading: orgsLoading, orgs } = useMyOrgs()

  if (activeLoading || orgsLoading) return <Skeleton className='h-9 w-32' />

  const handleSwitch = (org: (typeof orgs)[number]) => {
    setActiveOrgCookieClient({ orgId: org.org._id, slug: org.org.slug })
    router.push('/dashboard')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className='gap-2' variant='outline'>
          {activeOrg ? (
            <>
              <OrgAvatar
                name={activeOrg.name}
                size='sm'
                src={activeOrg.avatarId ? `/api/image?id=${activeOrg.avatarId}` : undefined}
              />
              <span className='max-w-24 truncate'>{activeOrg.name}</span>
            </>
          ) : (
            <span>Select org</span>
          )}
          <ChevronDown className='size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start'>
        {orgs.map(item => (
          <DropdownMenuItem className='gap-2' key={item.org._id} onSelect={() => handleSwitch(item)}>
            <OrgAvatar
              name={item.org.name}
              size='sm'
              src={item.org.avatarId ? `/api/image?id=${item.org.avatarId}` : undefined}
            />
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
