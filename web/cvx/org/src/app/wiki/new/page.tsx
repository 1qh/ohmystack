'use client'

import { api } from '@a/be-convex'
import { orgScoped } from '@a/be-convex/t'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { Form, useFormMutation } from '@noboil/convex/components'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { useOrg } from '~/hook/use-org'

const NewWikiPage = () => {
  const router = useRouter(),
    { org } = useOrg(),
    form = useFormMutation({
      mutation: api.wiki.create,
      onSuccess: () => {
        toast.success('Wiki page created')
        router.push('/wiki')
      },
      resetOnSuccess: true,
      schema: orgScoped.wiki,
      transform: d => ({ ...d, orgId: org._id })
    })

  return (
    <div className='flex justify-center'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle>Create wiki page</CardTitle>
        </CardHeader>
        <CardContent>
          <Form
            className='space-y-4'
            form={form}
            render={({ Choose, Submit, Text }) => (
              <>
                <FieldGroup>
                  <Text name='title' placeholder='Page title' />
                  <Text name='slug' placeholder='my-wiki-page' />
                  <Text multiline name='content' />
                  <Choose name='status' />
                </FieldGroup>
                <Submit className='w-full'>Create wiki page</Submit>
              </>
            )}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default NewWikiPage
