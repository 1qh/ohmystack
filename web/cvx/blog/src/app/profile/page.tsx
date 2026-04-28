/* eslint-disable @typescript-eslint/strict-void-return */
/* oxlint-disable jsx-no-new-object-as-prop */
/** biome-ignore-all lint/nursery/noInlineStyles: dynamic percentage width */
/* oxlint-disable forbid-component-props -- shadcn/Tailwind pattern requires className/style on shared components */
/* oxlint-disable eslint-plugin-react(forbid-component-props) */
'use client'
import type { ChangeEvent } from 'react'
import { api } from '@a/be-convex'
import { cn } from '@a/ui'
import { Button } from '@a/ui/button'
import { FieldGroup } from '@a/ui/field'
import { Spinner } from '@a/ui/spinner'
import { useMutation, useQuery } from 'convex/react'
import { Upload } from 'lucide-react'
import Link from 'next/link'
import { Form, useForm } from 'noboil/convex/components'
import { useUpload } from 'noboil/convex/react'
import { useRef } from 'react'
import { toast } from 'sonner'
import { profileSchema } from '~/schema'
const AvatarUpload = () => {
  const { cancel, isUploading, progress, upload } = useUpload(api.file.upload)
  const upsert = useMutation(api.blogProfile.upsert)
  const inputRef = useRef<HTMLInputElement>(null)
  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await upload(file)
    if (result.ok) {
      await upsert({ avatar: result.storageId })
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
          <Button data-testid='custom-upload-cancel' onClick={cancel} size='sm' variant='ghost'>
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
  const profile = useQuery(api.blogProfile.get, {})
  const upsert = useMutation(api.blogProfile.upsert)
  const form = useForm({
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
