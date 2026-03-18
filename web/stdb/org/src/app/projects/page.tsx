'use client'

import type { Project } from '@a/be-spacetimedb/spacetimedb/types'

import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { withStringId } from '@a/fe/utils'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { Checkbox } from '@a/ui/checkbox'
import { Input } from '@a/ui/input'
import { defaultOnError, useBulkSelection, useSearch } from '@noboil/spacetimedb/react'
import { FolderOpen, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { useReducer } from 'spacetimedb/react'

import { useOrg } from '~/hook/use-org'
import { useOrgTable } from '~/hook/use-org-table'

const ProjectsPage = () => {
  const { isAdmin, org } = useOrg(),
    [orgProjectRows, isProjectsReady] = useOrgTable<Project>(tables.project),
    orgProjects = orgProjectRows.map(withStringId),
    [query, setQuery] = useState(''),
    { results: projects } = useSearch(orgProjects, isProjectsReady, {
      fields: ['name', 'description'],
      query
    }),
    rmProject = useReducer(reducers.rmProject),
    { clear, handleBulkDelete, selected, toggleSelect, toggleSelectAll } = useBulkSelection({
      items: projects,
      onError: defaultOnError,
      onSuccess: (count: number) => {
        toast.success(`${count} project(s) deleted`)
      },
      orgId: org._id,
      rm: async id => rmProject({ id: Number(id) })
    })

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

      {projects.length === 0 ? (
        <Card>
          <CardContent className='flex flex-col items-center py-8 text-center'>
            <FolderOpen className='mb-2 size-12 text-muted-foreground' />
            <p className='text-muted-foreground'>No projects yet</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {isAdmin && projects.length > 0 ? (
            <div className='flex items-center gap-2'>
              <Checkbox
                aria-label='Select all projects'
                checked={selected.size === projects.length}
                onCheckedChange={toggleSelectAll}
              />
              <span className='text-sm text-muted-foreground'>Select all</span>
            </div>
          ) : null}
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
            {projects.map(p => (
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
                <Link href={`/projects/${p.id}`}>
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
