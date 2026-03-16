'use client'

import type { output } from 'zod'

import { reducers } from '@a/be-spacetimedb/spacetimedb'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { Form, useFormMutation } from '@noboil/spacetimedb/components'
import slugify from '@sindresorhus/slugify'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { useReducer } from 'spacetimedb/react'

import { orgTeam } from '~/schema'

type OrgFormValues = output<typeof orgTeam>

const orgKeys = {
    name: 'name',
    slug: 'slug'
  } as const satisfies Record<'name' | 'slug', keyof OrgFormValues>,
  NewOrgPage = () => {
    const router = useRouter(),
      form = useFormMutation({
        mutate: useReducer(reducers.orgCreate),
        onSuccess: () => router.push('/'),
        schema: orgTeam,
        toast: { success: 'Organization created' },
        transform: d => ({ ...d, avatarId: undefined })
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
