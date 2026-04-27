'use client'
/* oxlint-disable forbid-component-props -- shadcn/Tailwind pattern requires className/style on shared components */
import type { output } from 'zod'
import { api } from '@a/be-convex'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import slugify from '@sindresorhus/slugify'
import { useMutation } from 'convex/react'
import { useRouter } from 'next/navigation'
import { Form, useForm } from 'noboil/convex/components'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { orgTeam } from '~/schema'
type OrgFormValues = output<typeof orgTeam>
const orgKeys = {
  name: 'name',
  slug: 'slug'
} as const satisfies Record<'name' | 'slug', keyof OrgFormValues>
const NewOrgPage = () => {
  const router = useRouter()
  const create = useMutation(api.org.create)
  const form = useForm({
    onSubmit: async d => {
      await create({ data: d })
      toast.success('Organization created')
      router.push('/')
      return d
    },
    resetOnSuccess: true,
    schema: orgTeam
  })
  const name = form.watch(orgKeys.name)
  const slug = form.watch(orgKeys.slug)
  const autoSlugRef = useRef(true)
  useEffect(() => {
    if (autoSlugRef.current) form.instance.setFieldValue(orgKeys.slug, slugify(name))
  }, [name, form.instance])
  return (
    <div className='container flex justify-center py-8'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle>Create organization</CardTitle>
          <CardDescription>Start collaborating with your team</CardDescription>
        </CardHeader>
        <CardContent>
          <Form
            className='space-y-4'
            form={form}
            render={({ Submit, Text }) => (
              <>
                <FieldGroup>
                  <Text helpText='Public organization name.' name={orgKeys.name} placeholder='Acme Inc' required />
                  <Text
                    helpText='Lowercase letters, numbers, and dashes.'
                    label='URL slug'
                    name={orgKeys.slug}
                    placeholder='acme-inc'
                    required
                  />
                </FieldGroup>
                <p className='text-xs text-muted-foreground'>/{slug || 'your-slug'}</p>
                <Submit className='w-full'>Create organization</Submit>
              </>
            )}
          />
        </CardContent>
      </Card>
    </div>
  )
}
export default NewOrgPage
