'use client'

import { api } from '@a/be-convex'
import { orgScoped } from '@a/be-convex/t'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { Form, useFormMutation } from '@noboil/convex/components'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { useOrg } from '~/hook/use-org'

const NewProjectPage = () => {
  const router = useRouter(),
    { org } = useOrg(),
    form = useFormMutation({
      mutation: api.project.create,
      onSuccess: () => {
        toast.success('Project created')
        router.push('/projects')
      },
      resetOnSuccess: true,
      schema: orgScoped.project,
      transform: d => ({ ...d, orgId: org._id })
    })

  return (
    <div className='flex justify-center'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle>Create project</CardTitle>
        </CardHeader>
        <CardContent>
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
                <Submit className='w-full'>Create project</Submit>
              </>
            )}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default NewProjectPage
