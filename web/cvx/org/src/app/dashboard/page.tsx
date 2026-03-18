'use client'

import { api } from '@a/be-convex'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { RoleBadge } from '@noboil/convex/components'
import { useOrgQuery } from '@noboil/convex/react'
import { FolderOpen, Users } from 'lucide-react'
import Link from 'next/link'

import { useOrg } from '~/hook/use-org'

const OrgDashboard = () => {
  const { org, role } = useOrg(),
    members = useOrgQuery(api.org.members),
    projects = useOrgQuery(api.project.list, { paginationOpts: { cursor: null, numItems: 5 } })

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold'>{org.name}</h1>
        <div className='flex items-center gap-2 text-muted-foreground'>
          <span>/{org.slug}</span>
          <RoleBadge role={role} />
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <Card>
          <CardHeader className='flex-row items-center gap-2'>
            <Users className='size-5' />
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-3xl font-bold'>{members?.length ?? '-'}</div>
            <Link className='text-sm text-primary hover:underline' href='/members'>
              View all members
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex-row items-center gap-2'>
            <FolderOpen className='size-5' />
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-3xl font-bold'>{projects?.page.length ?? '-'}</div>
            <Link className='text-sm text-primary hover:underline' href='/projects'>
              View all projects
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default OrgDashboard
