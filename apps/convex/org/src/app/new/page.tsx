'use client'

import type { output } from 'zod'

import { api } from '@a/be-convex'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { Form, useForm } from '@noboil/convex/components'
import slugify from '@sindresorhus/slugify'
import { useMutation } from 'convex/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { orgTeam } from '~/schema'

type OrgFormValues = output<typeof orgTeam>

const orgKeys = {
    name: 'name',
    slug: 'slug'
  } as const satisfies Record<'name' | 'slug', keyof OrgFormValues>,
  NewOrgPage = () => {
    const router = useRouter(),
      create = useMutation(api.org.create),
      form = useForm({
        onSubmit: async d => {
          await create({ data: d })
          toast.success('Organization created')
          router.push('/')
          return d
        },
        resetOnSuccess: true,
        schema: orgTeam
      }),
      name = form.watch(orgKeys.name),
      slug = form.watch(orgKeys.slug),
      autoSlugRef = useRef(true)

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
                    <Text name={orgKeys.name} placeholder='Acme Inc' />
                    <Text label='URL slug' name={orgKeys.slug} placeholder='acme-inc' />
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
