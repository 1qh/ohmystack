/* oxlint-disable promise/prefer-await-to-then, promise/always-return */
/* eslint-disable no-alert */
'use client'

import type { Id } from '@a/be-convex/model'

import { api } from '@a/be-convex'
import { orgScoped } from '@a/be-convex/t'
import { fail } from '@a/fe/utils'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { Skeleton } from '@a/ui/skeleton'
import { Form, PermissionGuard, useFormMutation } from '@noboil/convex/components'
import { canEditResource, useOrgMutation, useOrgQuery } from '@noboil/convex/react'
import { pickValues } from '@noboil/convex/zod'
import { useQuery } from 'convex/react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { toast } from 'sonner'

import { useOrg } from '~/hook/use-org'

const EditProjectForm = ({ projectId, taskCount }: { projectId: Id<'project'>; taskCount: number }) => {
    const router = useRouter(),
      { org } = useOrg(),
      project = useOrgQuery(api.project.read, { id: projectId }),
      remove = useOrgMutation(api.project.rm),
      form = useFormMutation({
        mutation: api.project.update,
        onSuccess: () => {
          toast.success('Project updated')
          router.push(`/projects/${projectId}`)
        },
        resetOnSuccess: true,
        schema: orgScoped.project,
        transform: d => ({ ...d, expectedUpdatedAt: project?.updatedAt, id: projectId, orgId: org._id }),
        values: project ? pickValues(orgScoped.project, project) : undefined
      }),
      handleDelete = () => {
        const msg =
          taskCount > 0
            ? `Delete this project and ${taskCount} task${taskCount === 1 ? '' : 's'}?`
            : 'Delete this project?'
        /** biome-ignore lint/suspicious/noAlert: demo page uses native confirm */
        if (!confirm(msg)) return
        remove({ id: projectId })
          .then(() => {
            toast.success('Project deleted')
            router.push('/projects')
          })
          .catch(fail)
      }

    if (!project) return <Skeleton className='h-40' />

    return (
      <Form
        className='space-y-4'
        form={form}
        render={({ Choose, Submit, Text }) => (
          <>
            <FieldGroup>
              <Text name='name' placeholder='Project name' />
              <Text multiline name='description' />
              <Choose name='status' />
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
  EditProjectPage = ({ params }: { params: Promise<{ projectId: Id<'project'> }> }) => {
    const { projectId } = use(params),
      { isAdmin } = useOrg(),
      me = useQuery(api.user.me, {}),
      project = useOrgQuery(api.project.read, { id: projectId }),
      tasks = useOrgQuery(api.task.byProject, { projectId }),
      editorsList = useOrgQuery(api.project.editors, { projectId })

    if (!(project && tasks !== undefined && me && editorsList)) return <Skeleton className='h-40' />

    const canEditProject = canEditResource({ editorsList, isAdmin, resource: project, userId: me._id })

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
              <EditProjectForm projectId={projectId} taskCount={tasks.length} />
            </CardContent>
          </Card>
        </div>
      </PermissionGuard>
    )
  }

export default EditProjectPage
