/* oxlint-disable promise/prefer-await-to-then */
'use client'

import { api } from '@a/be-convex'
import { fail } from '@a/fe/utils'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { Checkbox } from '@a/ui/checkbox'
import { Skeleton } from '@a/ui/skeleton'
import { useBulkSelection, useOrgQuery } from '@noboil/convex/react'
import { useMutation } from 'convex/react'
import { FolderOpen, Plus } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

import { useOrg } from '~/hook/use-org'

const ProjectsPage = () => {
  const { isAdmin, org } = useOrg(),
    projects = useOrgQuery(api.project.list, { paginationOpts: { cursor: null, numItems: 100 } }),
    rm = useMutation(api.project.rm),
    { clear, handleBulkDelete, selected, toggleSelect, toggleSelectAll } = useBulkSelection({
      items: projects?.page ?? [],
      onError: (e: unknown) => {
        fail(e)
      },
      onSuccess: (count: number) => {
        toast.success(`${count} project(s) deleted`)
      },
      orgId: org._id,
      rm
    })

  if (!projects) return <Skeleton className='h-40' />

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-4'>
          <h1 className='text-2xl font-bold'>Projects</h1>
          {isAdmin && selected.size > 0 ? (
            <div className='flex items-center gap-2'>
              <span className='text-sm text-muted-foreground'>{selected.size} selected</span>
              <Button
                onClick={() => {
                  handleBulkDelete()
                }}
                size='sm'
                variant='destructive'>
                Delete
              </Button>
              <Button onClick={clear} size='sm' variant='ghost'>
                Clear
              </Button>
            </div>
          ) : null}
        </div>
        <Button asChild>
          <Link href='/projects/new'>
            <Plus className='mr-2 size-4' />
            New project
          </Link>
        </Button>
      </div>

      {projects.page.length === 0 ? (
        <Card>
          <CardContent className='flex flex-col items-center py-8 text-center'>
            <FolderOpen className='mb-2 size-12 text-muted-foreground' />
            <p className='text-muted-foreground'>No projects yet</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {isAdmin && projects.page.length > 0 ? (
            <div className='flex items-center gap-2'>
              <Checkbox
                aria-label='Select all projects'
                checked={selected.size === projects.page.length}
                onCheckedChange={toggleSelectAll}
              />
              <span className='text-sm text-muted-foreground'>Select all</span>
            </div>
          ) : null}
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
            {projects.page.map(p => (
              <div className='relative' key={p._id}>
                {isAdmin ? (
                  <Checkbox
                    aria-label={`Select ${p.name}`}
                    checked={selected.has(p._id)}
                    className='absolute top-2 left-2 z-10'
                    onCheckedChange={() => toggleSelect(p._id)}
                    onClick={e => e.stopPropagation()}
                  />
                ) : null}
                <Link href={`/projects/${p._id}`}>
                  <Card className='transition-colors hover:bg-muted'>
                    <CardHeader className={isAdmin ? 'pl-10' : ''}>
                      <CardTitle>{p.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className='text-sm text-muted-foreground'>{p.description ?? 'No description'}</p>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default ProjectsPage
