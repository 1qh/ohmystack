'use client'
import type { Doc } from '@a/be-convex/model'
import type { output } from 'zod'
import { api } from '@a/be-convex'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { Form, useForm } from '@noboil/convex/components'
import { setActiveOrgCookieClient } from '@noboil/convex/react'
import { pickValues } from '@noboil/convex/zod'
import { useMutation } from 'convex/react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { orgTeam } from '~/schema'
type OrgFormValues = output<typeof orgTeam>
const orgKeys = {
  name: 'name',
  slug: 'slug'
} as const satisfies Record<'name' | 'slug', keyof OrgFormValues>
interface OrgSettingsFormProps {
  org: Doc<'org'>
}
const OrgSettingsForm = ({ org: o }: OrgSettingsFormProps) => {
  const router = useRouter(),
    update = useMutation(api.org.update),
    form = useForm({
      onSubmit: async d => {
        await update({ data: d, orgId: o._id })
        toast.success('Settings updated')
        if (d.slug !== o.slug) setActiveOrgCookieClient({ orgId: o._id, slug: d.slug })
        router.push('/settings')
        return d
      },
      schema: orgTeam,
      values: pickValues(orgTeam, o)
    }),
    slug = form.watch(orgKeys.slug)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization settings</CardTitle>
        <CardDescription>Update your organization details</CardDescription>
      </CardHeader>
      <CardContent>
        <Form
          className='space-y-4'
          form={form}
          render={({ Submit, Text }) => (
            <>
              <FieldGroup>
                <Text name={orgKeys.name} />
                <Text name={orgKeys.slug} />
              </FieldGroup>
              <p className='text-xs text-muted-foreground'>/{slug}</p>
              <Submit>Save changes</Submit>
            </>
          )}
        />
      </CardContent>
    </Card>
  )
}
export default OrgSettingsForm
