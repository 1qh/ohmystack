'use client'
/* oxlint-disable eslint(no-underscore-dangle) */
import { reducers } from '@a/be-spacetimedb/spacetimedb'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { useRouter } from 'next/navigation'
import { Form, useFormMutation } from 'noboil/spacetimedb/components'
import { useReducer } from 'spacetimedb/react'
import { useOrg } from '~/hook/use-org'
import { project } from '~/schema'
const NewProjectPage = () => {
  const router = useRouter()
  const { org } = useOrg()
  const form = useFormMutation({
    mutate: useReducer(reducers.createProject),
    onSuccess: () => router.push('/projects'),
    schema: project,
    toast: { success: 'Project created' },
    transform: d => ({ ...d, orgId: Number(org._id) })
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
                  <Text helpText='Keep it short and clear.' name='name' placeholder='Project name' required />
                  <Text helpText='Optional context for the team.' multiline name='description' />
                  <Choose helpText='Current project state.' name='status' />
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
