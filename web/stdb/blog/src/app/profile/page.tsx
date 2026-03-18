// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
'use client'

import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { FieldGroup } from '@a/ui/field'
import { Spinner } from '@a/ui/spinner'
import { Form, useFormMutation } from '@noboil/spacetimedb/components'
import Link from 'next/link'
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'

import { profileSchema } from '~/schema'

const Page = () => {
  const [profiles, isReady] = useTable(tables.blogProfile),
    { identity } = useSpacetimeDB(),
    // eslint-disable-next-line no-restricted-properties
    isPlaywright = process.env.NEXT_PUBLIC_PLAYWRIGHT === '1',
    profile = profiles.find(p => identity && p.userId.isEqual(identity)) ?? null,
    shouldShowContent = isReady || isPlaywright,
    form = useFormMutation({
      mutate: useReducer(reducers.upsertBlogProfile),
      resetOnSuccess: false,
      schema: profileSchema,
      toast: { success: 'Profile saved' },
      values: shouldShowContent
        ? profile
          ? {
              avatar: profile.avatar ?? null,
              bio: profile.bio,
              displayName: profile.displayName,
              notifications: profile.notifications,
              theme: profile.theme
            }
          : { displayName: '', notifications: true, theme: 'system' as const }
        : undefined
    })

  if (!shouldShowContent)
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
              <Text data-testid='profile-displayName' helpText='Shown to other users.' name='displayName' required />
              <Text className='min-h-24' data-testid='profile-bio' helpText='Optional short bio.' multiline name='bio' />
              <Choose data-testid='profile-theme' helpText='Pick your preferred appearance.' name='theme' required />
              <Toggle
                data-testid='profile-notifications'
                falseLabel='Off'
                helpText='Enable activity notifications.'
                name='notifications'
                trueLabel='On'
              />
              <File
                accept='image/*'
                data-testid='profile-avatar'
                helpText='Optional avatar image.'
                maxSize={5 * 1024 * 1024}
                name='avatar'
              />
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
