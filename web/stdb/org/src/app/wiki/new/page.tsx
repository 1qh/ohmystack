'use client'
/* oxlint-disable forbid-component-props, no-underscore-dangle -- shadcn/Tailwind pattern requires className/style on shared components / Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
import { reducers } from '@a/be-spacetimedb/spacetimedb'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { useRouter } from 'next/navigation'
import { Form, useFormMutation } from 'noboil/spacetimedb/components'
import { useReducer } from 'spacetimedb/react'
import { useOrg } from '~/hook/use-org'
import { wiki } from '~/schema'
const NewWikiPage = () => {
  const router = useRouter()
  const { org } = useOrg()
  const form = useFormMutation({
    mutate: useReducer(reducers.createWiki),
    onSuccess: () => router.push('/wiki'),
    schema: wiki,
    toast: { success: 'Wiki page created' },
    transform: d => ({ ...d, orgId: Number(org._id) })
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
