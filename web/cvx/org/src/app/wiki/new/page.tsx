'use client'
/* oxlint-disable eslint-plugin-react(forbid-component-props), eslint(no-underscore-dangle) */
import { api } from '@a/be-convex'
import { orgScoped } from '@a/be-convex/s'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { useRouter } from 'next/navigation'
import { Form, useFormMutation } from 'noboil/convex/components'
import { toast } from 'sonner'
import { useOrg } from '~/hook/use-org'
const NewWikiPage = () => {
  const router = useRouter()
  const { org } = useOrg()
  const form = useFormMutation({
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
                  <Text helpText='Page heading shown in wiki lists.' name='title' placeholder='Page title' required />
                  <Text helpText='URL-safe slug used in links.' name='slug' placeholder='my-wiki-page' required />
                  <Text helpText='Optional draft content.' multiline name='content' />
                  <Choose helpText='Publish when content is ready.' name='status' required />
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
