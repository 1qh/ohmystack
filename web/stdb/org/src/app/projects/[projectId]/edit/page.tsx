// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'

import type { Project, Task } from '@a/be-spacetimedb/spacetimedb/types'

import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { sameIdentity } from '@a/fe/utils'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { Skeleton } from '@a/ui/skeleton'
import { Form, PermissionGuard, useFormMutation } from '@noboil/spacetimedb/components'
import { useMut } from '@noboil/spacetimedb/react'
import { pickValues } from '@noboil/spacetimedb/zod'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { useReducer, useSpacetimeDB } from 'spacetimedb/react'

import { useOrg } from '~/hook/use-org'
import { useOrgTable } from '~/hook/use-org-table'
import { project as projectSchema } from '~/schema'

const EditProjectForm = ({ projectId, taskCount }: { projectId: number; taskCount: number }) => {
    const router = useRouter(),
      [projects] = useOrgTable<Project>(tables.project),
      project = projects.find(p => p.id === projectId),
      removeProject = useMut(reducers.rmProject, {
        onSuccess: () => router.push('/projects'),
        toast: { success: 'Project deleted' }
      }),
      form = useFormMutation({
        mutate: useReducer(reducers.updateProject),
        onSuccess: () => router.push(`/projects/${projectId}`),
        resetOnSuccess: true,
        schema: projectSchema,
        toast: { success: 'Project updated' },
        transform: d => ({ ...d, expectedUpdatedAt: project?.updatedAt, id: projectId }),
        values: project ? pickValues(projectSchema, project) : undefined
      }),
      handleDelete = () => {
        if (taskCount < 0) return
        removeProject({ id: projectId })
      }

    if (!project) return <Skeleton className='h-40' />

    return (
      <Form
        className='space-y-4'
        form={form}
        render={({ Choose, Submit, Text }) => (
          <>
            <FieldGroup>
              <Text helpText='Project display name.' name='name' placeholder='Project name' required />
              <Text helpText='Optional details for collaborators.' multiline name='description' />
              <Choose helpText='Current project lifecycle state.' name='status' />
            </FieldGroup>
            <div className='flex gap-2'>
              <Submit className='flex-1'>Save changes</Submit>
              <Button onClick={handleDelete} type='button' variant='destructive'>
                Delete
              </Button>
            </div>
          </>
        )}
      />
    )
  },
  EditProjectPage = ({ params }: { params: Promise<{ projectId: string }> }) => {
    const { projectId } = use(params),
      pid = Number(projectId),
      { isAdmin } = useOrg(),
      { identity } = useSpacetimeDB(),
      [projects] = useOrgTable<Project>(tables.project),
      [tasks] = useOrgTable<Task>(tables.task),
      project = projects.find(p => p.id === pid),
      projectTasks = tasks.filter(t => t.projectId === pid)

    if (!(project && identity)) return <Skeleton className='h-40' />

    const canEditProject =
      isAdmin ||
      sameIdentity(project.userId, identity) ||
      (project.editors ?? []).some(editor => sameIdentity(editor, identity))

    return (
      <PermissionGuard
        backHref={`/projects/${projectId}`}
        backLabel='project'
        canAccess={canEditProject}
        resource='project'>
        <div className='flex justify-center'>
          <Card className='w-full max-w-md'>
            <CardHeader>
              <CardTitle>Edit project</CardTitle>
            </CardHeader>
            <CardContent>
              <EditProjectForm projectId={pid} taskCount={projectTasks.length} />
            </CardContent>
          </Card>
        </div>
      </PermissionGuard>
    )
  }

export default EditProjectPage
