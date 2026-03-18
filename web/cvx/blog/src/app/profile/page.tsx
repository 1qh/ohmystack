'use client'

import { api } from '@a/be-convex'
import { FieldGroup } from '@a/ui/field'
import { Spinner } from '@a/ui/spinner'
import { Form, useForm } from '@noboil/convex/components'
import { useMutation, useQuery } from 'convex/react'
import Link from 'next/link'
import { toast } from 'sonner'

import { profileSchema } from '~/schema'

const Page = () => {
  const profile = useQuery(api.blogProfile.get, {}),
    upsert = useMutation(api.blogProfile.upsert),
    form = useForm({
      onSubmit: async d => {
        await upsert(d)
        return d
      },
      onSuccess: () => {
        toast.success('Profile saved')
      },
      schema: profileSchema,
      values:
        profile === undefined
          ? undefined
          : profile
            ? {
                avatar: profile.avatar ?? null,
                bio: profile.bio,
                displayName: profile.displayName,
                notifications: profile.notifications,
                theme: profile.theme
              }
            : { displayName: '', notifications: true, theme: 'system' as const }
    })

  if (profile === undefined)
    return (
      <div className='flex min-h-40 items-center justify-center'>
        <Spinner />
      </div>
    )

  return (
    <div className='space-y-4' data-testid='profile-page'>
      <Link className='rounded-lg px-3 py-2 hover:bg-muted' data-testid='profile-back' href='/'>
        &larr; Back
      </Link>
      <h1 className='text-xl font-medium'>{profile ? 'Edit Profile' : 'Set Up Profile'}</h1>
      <Form
        className='flex flex-col gap-4'
        data-testid='profile-form'
        form={form}
        render={({ Choose, File, Submit, Text, Toggle }) => (
          <>
            <FieldGroup className='gap-5'>
              <Text data-testid='profile-displayName' name='displayName' />
              <Text className='min-h-24' data-testid='profile-bio' multiline name='bio' />
              <Choose data-testid='profile-theme' name='theme' />
              <Toggle data-testid='profile-notifications' falseLabel='Off' name='notifications' trueLabel='On' />
              <File accept='image/*' data-testid='profile-avatar' maxSize={5 * 1024 * 1024} name='avatar' />
            </FieldGroup>
            <Submit className='ml-auto' data-testid='profile-submit'>
              Save
            </Submit>
          </>
        )}
      />
    </div>
  )
}

export default Page
