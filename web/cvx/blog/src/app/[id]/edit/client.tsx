'use client'
import type { Preloaded } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import type { ComponentProps } from 'react'
import { api } from '@a/be-convex'
import { cn } from '@a/ui'
import { FieldGroup } from '@a/ui/field'
import { Label } from '@a/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@a/ui/popover'
import { Spinner } from '@a/ui/spinner'
import { Switch } from '@a/ui/switch'
import { AutoSaveIndicator, Form, useForm } from '@noboil/convex/components'
import { useMutation, usePreloadedQuery } from 'convex/react'
import { Settings } from 'lucide-react'
import Link from 'next/link'
import { createElement, useId, useTransition } from 'react'
import { toast } from 'sonner'
import { editBlog } from '~/schema'
const Publish = ({ className, id, published, ...props }: ComponentProps<'div'> & { id: string; published: boolean }) => {
    const update = useMutation(api.blog.update),
      [pending, go] = useTransition(),
      switchId = useId()
    return (
      <div className={cn('flex items-center gap-2', className)} data-testid='publish-toggle' {...props}>
        <Label htmlFor={switchId}>{pending ? <Spinner /> : published ? 'Published' : 'Draft'}</Label>
        <Switch
          checked={published}
          data-testid='publish-switch'
          disabled={pending}
          id={switchId}
          onCheckedChange={() =>
            go(async () => {
              await update({ id, published: !published })
              toast.success(published ? 'Unpublished' : 'Published')
            })
          }
          size='default'
        />
      </div>
    )
  },
  Edit = ({ blog }: { blog: NonNullable<FunctionReturnType<typeof api.blog.read>> }) => {
    const update = useMutation(api.blog.update),
      form = useForm({
        autoSave: { debounceMs: 2000, enabled: true },
        onSubmit: async d => {
          await update({ id: blog._id, ...d, expectedUpdatedAt: blog.updatedAt })
          return d
        },
        schema: editBlog,
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
  },
  Setting = ({ blog }: { blog: NonNullable<FunctionReturnType<typeof api.blog.read>> }) => {
    const update = useMutation(api.blog.update),
      form = useForm({
        onSubmit: async d => {
          await update({ id: blog._id, ...d })
          return d
        },
        onSuccess: () => {
          toast.success('Saved')
        },
        schema: editBlog,
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
  },
  Client = ({ preloaded }: { preloaded: Preloaded<typeof api.blog.read> }) => {
    const b = usePreloadedQuery(preloaded)
    if (!b?.own)
      return (
        <p className='text-muted-foreground' data-testid='blog-not-found'>
          Blog not found
        </p>
      )
    const settingsTrigger = createElement(
      'button',
      {
        'aria-label': 'Open settings',
        className: 'rounded-lg hover:bg-muted',
        'data-testid': 'settings-trigger',
        type: 'button'
      },
      createElement(Settings, { className: 'size-8 stroke-1 p-1.5 group-hover:block' })
    )
    return (
      <div data-testid='edit-blog-page'>
        <div className='mb-3 flex justify-between'>
          <Link className='rounded-lg px-3 py-2 hover:bg-muted' data-testid='back-link' href={`/${b._id}`}>
            &larr; Back
          </Link>
          <Popover>
            <PopoverTrigger render={settingsTrigger} />
            <PopoverContent data-testid='settings-popover'>
              <Setting blog={b} key={b._id} />
            </PopoverContent>
          </Popover>
        </div>
        <Edit blog={b} key={b._id} />
      </div>
    )
  }
export { Client, Publish }
