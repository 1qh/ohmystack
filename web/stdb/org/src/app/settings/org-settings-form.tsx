'use client'
/* oxlint-disable forbid-component-props, no-underscore-dangle -- shadcn/Tailwind pattern requires className/style on shared components / Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
import type { Org } from '@a/be-spacetimedb/spacetimedb/types'
import type { output } from 'zod'
import { reducers } from '@a/be-spacetimedb/spacetimedb'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { useRouter } from 'next/navigation'
import { Form, useFormMutation } from 'noboil/spacetimedb/components'
import { setActiveOrgCookieClient } from 'noboil/spacetimedb/react'
import { pickValues } from 'noboil/spacetimedb/zod'
import { useRef } from 'react'
import { useReducer } from 'spacetimedb/react'
import { orgTeam } from '~/schema'
type OrgFormValues = output<typeof orgTeam>
const orgKeys = {
  name: 'name',
  slug: 'slug'
} as const satisfies Record<'name' | 'slug', keyof OrgFormValues>
interface OrgSettingsFormProps {
  org: Org & { _id: string }
}
const OrgSettingsForm = ({ org: o }: OrgSettingsFormProps) => {
  const router = useRouter()
  const slugRef = useRef('')
  const form = useFormMutation({
    mutate: useReducer(reducers.orgUpdate),
    onSuccess: () => {
      if (slugRef.current && slugRef.current !== o.slug) setActiveOrgCookieClient({ orgId: o._id, slug: slugRef.current })
      router.push('/settings')
    },
    schema: orgTeam,
    toast: { success: 'Settings updated' },
    transform: d => {
      slugRef.current = typeof d.slug === 'string' ? d.slug : ''
      return { ...d, orgId: Number(o._id) }
    },
    values: pickValues(orgTeam, o)
  })
  const slug = form.watch(orgKeys.slug)
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
                <Text helpText='Public organization name.' name={orgKeys.name} required />
                <Text helpText='Lowercase letters, numbers, and dashes.' name={orgKeys.slug} required />
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
