/* oxlint-disable jsx-no-jsx-as-prop */
/* oxlint-disable forbid-component-props -- shadcn/Tailwind pattern requires className/style on shared components */
/* oxlint-disable eslint-plugin-react(forbid-component-props) */
// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
'use client'
import type { Blog } from '@a/be-spacetimedb/spacetimedb/types'
import type { ComponentProps } from 'react'
import { reducers } from '@a/be-spacetimedb/spacetimedb'
import { cn } from '@a/ui'
import { FieldGroup } from '@a/ui/field'
import { Label } from '@a/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@a/ui/popover'
import { Spinner } from '@a/ui/spinner'
import { Switch } from '@a/ui/switch'
import { Settings } from 'lucide-react'
import Link from 'next/link'
import { AutoSaveIndicator, Form, useFormMutation } from 'noboil/spacetimedb/components'
import { useMut } from 'noboil/spacetimedb/react'
import { useId, useTransition } from 'react'
import { useReducer, useSpacetimeDB } from 'spacetimedb/react'
import { editBlog } from '~/schema'
const Publish = ({
  className,
  id,
  published,
  ...props
}: Omit<ComponentProps<'div'>, 'id'> & { id: number; published: boolean }) => {
  const publishId = useId()
  const update = useMut(reducers.updateBlog, {
    toast: {
      error: 'Failed to update publish status',
      success: (_result, args) => (args.published ? 'Published' : 'Unpublished')
    }
  })
  const [pending, go] = useTransition()
  return (
    <div className={cn('flex items-center gap-2', className)} data-testid='publish-toggle' {...props}>
      <Label htmlFor={publishId}>{pending ? <Spinner /> : published ? 'Published' : 'Draft'}</Label>
      <Switch
        checked={published}
        data-testid='publish-switch'
        disabled={pending}
        id={publishId}
        onCheckedChange={() =>
          go(async () => {
            await update({ id, published: !published })
          })
        }
        size='default'
      />
    </div>
  )
}
const Edit = ({ blog }: { blog: Blog }) => {
  const form = useFormMutation({
    autoSave: { debounceMs: 2000, enabled: true },
    mutate: useReducer(reducers.updateBlog),
    resetOnSuccess: false,
    schema: editBlog,
    toast: { success: 'Saved' },
    transform: d => ({ ...d, id: blog.id }),
    values: {
      attachments: blog.attachments ?? [],
      content: blog.content,
      coverImage: blog.coverImage ?? null,
      tags: blog.tags,
      title: blog.title
    }
  })
  return (
    <Form
      className='flex flex-col gap-3'
      data-testid='edit-blog-form'
      form={form}
      render={({ Arr, Err, File, Files, Text }) => (
        <>
          <Err error={form.error} />
          <FieldGroup className='gap-5'>
            <Text data-testid='edit-title' helpText='A clear title improves discoverability.' name='title' required />
            <Text
              className='min-h-64'
              data-testid='edit-content'
              helpText='Keep it readable and specific.'
              multiline
              name='content'
              required
            />
            <File
              accept='image/*'
              data-testid='edit-cover-image'
              helpText='Optional cover image.'
              maxSize={5 * 1024 * 1024}
              name='coverImage'
            />
            <Files
              accept='image/*,application/pdf'
              data-testid='edit-attachments'
              helpText='Optional supporting files.'
              maxSize={10 * 1024 * 1024}
              name='attachments'
            />
            <Arr
              data-testid='edit-tags'
              helpText='Press Enter to add each tag.'
              name='tags'
              placeholder='Add tag...'
              transform={s => s.toLowerCase()}
            />
          </FieldGroup>
          <AutoSaveIndicator className='ml-auto block' data-testid='auto-save-indicator' lastSaved={form.lastSaved} />
        </>
      )}
    />
  )
}
const Setting = ({ blog }: { blog: Blog }) => {
  const form = useFormMutation({
    mutate: useReducer(reducers.updateBlog),
    resetOnSuccess: false,
    schema: editBlog,
    toast: { success: 'Saved' },
    transform: d => ({ category: d.category, id: blog.id, published: d.published }),
    values: { category: blog.category, published: blog.published }
  })
  return (
    <Form
      className='flex flex-col gap-4'
      form={form}
      render={({ Choose, Submit, Toggle }) => (
        <>
          <FieldGroup className='gap-5'>
            <Choose helpText='Choose how this post is categorized.' name='category' required />
            <Toggle
              falseLabel='Draft'
              helpText='Publish when ready to make it visible.'
              name='published'
              trueLabel='Published'
            />
          </FieldGroup>
          <Submit>Save</Submit>
        </>
      )}
    />
  )
}
const Client = ({ blog }: { blog: Blog | null }) => {
  const { identity } = useSpacetimeDB()
  const isPlaywrightTest = process.env.NEXT_PUBLIC_PLAYWRIGHT === '1'
  if (!(blog && (isPlaywrightTest || (identity && blog.userId.isEqual(identity)))))
    return (
      <p className='text-muted-foreground' data-testid='blog-not-found'>
        Blog not found
      </p>
    )
  return (
    <div data-testid='edit-blog-page'>
      <div className='mb-3 flex justify-between'>
        <Link className='rounded-lg px-3 py-2 hover:bg-muted' data-testid='back-link' href={`/${blog.id}`}>
          &larr; Back
        </Link>
        <Popover>
          <PopoverTrigger
            render={
              <button
                aria-label='Open settings'
                className='rounded-lg hover:bg-muted'
                data-testid='settings-trigger'
                type='button'>
                <Settings className='size-8 stroke-1 p-1.5 group-hover:block' />
              </button>
            }
          />
          <PopoverContent data-testid='settings-popover'>
            <Setting blog={blog} key={blog.id} />
          </PopoverContent>
        </Popover>
      </div>
      <Edit blog={blog} key={blog.id} />
    </div>
  )
}
export { Client, Publish }
