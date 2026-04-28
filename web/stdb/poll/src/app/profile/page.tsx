/* eslint-disable @typescript-eslint/strict-void-return */
/* oxlint-disable jsx-no-new-object-as-prop, promise/prefer-await-to-then, promise/always-return, promise/catch-or-return */
/** biome-ignore-all lint/nursery/noInlineStyles: dynamic percentage width */
// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
'use client'
import type { ChangeEvent } from 'react'
import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { cn } from '@a/ui'
import { Button } from '@a/ui/button'
import { FieldGroup } from '@a/ui/field'
import { Spinner } from '@a/ui/spinner'
import { Upload } from 'lucide-react'
import Link from 'next/link'
import { Form, useFormMutation } from 'noboil/spacetimedb/components'
import { useResolveFileUrl, useUpload } from 'noboil/spacetimedb/react'
import { useRef } from 'react'
import { toast } from 'sonner'
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'
import { profileSchema } from '~/schema'
const AvatarUpload = () => {
  const registerUpload = useReducer(reducers.registerUploadFile)
  const { isUploading, progress, upload } = useUpload({
    registerFile: async ({ data, ...meta }) => {
      await registerUpload({ ...meta, data })
      return { storageId: `${meta.filename}:${Date.now()}` }
    }
  })
  const upsertProfile = useReducer(reducers.upsertPollProfile)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const controller = new AbortController()
    abortRef.current = controller
    const result = await upload(file, { signal: controller.signal })
    abortRef.current = null
    if (result.ok) {
      upsertProfile({
        avatar: result.url ?? result.storageId,
        bio: undefined,
        displayName: undefined,
        notifications: undefined,
        theme: undefined
      })
      toast.success('Avatar uploaded')
    } else toast.error(`Upload failed: ${result.code}`)
  }
  return (
    <div className='space-y-2' data-testid='custom-avatar-upload'>
      <p className='text-sm font-medium'>Custom Avatar Upload (useUpload)</p>
      <div className='flex items-center gap-3'>
        <input accept='image/*' className='hidden' onChange={handleChange} ref={inputRef} type='file' />
        <Button
          data-testid='custom-upload-btn'
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
          size='sm'
          variant='outline'>
          <Upload className='mr-1.5 size-4' />
          {isUploading ? `Uploading ${progress}%` : 'Upload Avatar'}
        </Button>
        {isUploading ? (
          <Button data-testid='custom-upload-cancel' onClick={() => abortRef.current?.abort()} size='sm' variant='ghost'>
            Cancel
          </Button>
        ) : null}
      </div>
      {isUploading ? (
        <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted'>
          <div
            className={cn('h-full rounded-full bg-primary transition-all')}
            data-testid='upload-progress'
            style={{ width: `${String(progress)}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}
const Page = () => {
  const [profiles, isReady] = useTable(tables.pollProfile)
  const { identity } = useSpacetimeDB()
  const isPlaywright = process.env.NEXT_PUBLIC_PLAYWRIGHT === '1'
  const profile = profiles.find(p => identity && p.userId.isEqual(identity)) ?? null
  const shouldShowContent = isReady || isPlaywright
  const resolvedAvatar = useResolveFileUrl(profile?.avatar)
  const form = useFormMutation({
    mutate: useReducer(reducers.upsertPollProfile),
    resetOnSuccess: false,
    schema: profileSchema,
    toast: { success: 'Profile saved' },
    values: shouldShowContent
      ? profile
        ? {
            avatar: resolvedAvatar,
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
      <AvatarUpload />
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
