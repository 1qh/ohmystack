/* oxlint-disable promise/prefer-await-to-then */
/* oxlint-disable eslint-plugin-react(forbid-component-props), eslint(no-underscore-dangle) */
'use client'
import { api } from '@a/be-convex'
import { fail } from '@a/fe/utils'
import { cn } from '@a/ui'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { Checkbox } from '@a/ui/checkbox'
import { Input } from '@a/ui/input'
import { Skeleton } from '@a/ui/skeleton'
import { useMutation } from 'convex/react'
import { FolderOpen, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useBulkSelection, useOrgQuery } from 'noboil/convex/react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useOrg } from '~/hook/use-org'
const filterByQuery = <T extends Record<string, unknown>>(items: T[], fields: (keyof T & string)[], q: string): T[] => {
  const normalized = q.trim().toLowerCase()
  if (!normalized) return items
  const out: T[] = []
  for (const item of items)
    for (const f of fields)
      if (String(item[f]).toLowerCase().includes(normalized)) {
        out.push(item)
        break
      }
  return out
}
const ProjectsPage = () => {
  const { isAdmin, org } = useOrg()
  const projects = useOrgQuery(api.project.list, { paginationOpts: { cursor: null, numItems: 100 } })
  const rm = useMutation(api.project.rm)
  const [query, setQuery] = useState('')
  const filteredProjects = useMemo(
    () => filterByQuery(projects?.page ?? [], ['name', 'description'], query),
    [projects?.page, query]
  )
  const { clear, handleBulkDelete, selected, toggleSelect, toggleSelectAll } = useBulkSelection({
    items: filteredProjects,
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
        <Button nativeButton={false} render={p => <Link {...p} href='/projects/new' />}>
          <Plus className='mr-2 size-4' />
          New project
        </Button>
      </div>
      <div className='relative'>
        <Search className='absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          className='pl-9'
          data-testid='project-search-input'
          onChange={e => setQuery(e.target.value)}
          placeholder='Search projects...'
          type='search'
          value={query}
        />
      </div>
      {filteredProjects.length === 0 ? (
        <Card>
          <CardContent className='flex flex-col items-center py-8 text-center'>
            <FolderOpen className='mb-2 size-12 text-muted-foreground' />
            <p className='text-muted-foreground'>No projects yet</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {isAdmin && filteredProjects.length > 0 ? (
            <div className='flex items-center gap-2'>
              <Checkbox
                aria-label='Select all projects'
                checked={selected.size === filteredProjects.length}
                onCheckedChange={toggleSelectAll}
              />
              <span className='text-sm text-muted-foreground'>Select all</span>
            </div>
          ) : null}
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
            {filteredProjects.map(p => (
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
                    <CardHeader className={cn(isAdmin ? 'pl-10' : '')}>
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
