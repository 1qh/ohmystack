/* eslint-disable @next/next/no-img-element */
// biome-ignore-all lint/performance/noImgElement: x
'use client'
import type { FunctionReturnType } from 'convex/server'
import type { ComponentProps } from 'react'

import { api } from '@a/be-convex'
import { cn } from '@a/ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@a/ui/alert-dialog'
import { Button } from '@a/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@a/ui/dialog'
import { FieldGroup } from '@a/ui/field'
import { Separator } from '@a/ui/separator'
import { Spinner } from '@a/ui/spinner'
import { Form, useForm } from '@noboil/convex/components'
import { useOptimisticMutation } from '@noboil/convex/react'
import { useMutation } from 'convex/react'
import { format, formatDistance } from 'date-fns'
import { Pencil, Plus, Send, Trash, UserRound } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { createElement, useState } from 'react'
import { toast } from 'sonner'

import { createBlog } from '~/schema'

import { Publish } from './[id]/edit/client'
type Blog = FunctionReturnType<typeof api.blog.list>['page'][number]
const Delete = ({ id, onOptimisticRemove }: { id: Blog['_id']; onOptimisticRemove?: () => void }) => {
    const { execute, isPending } = useOptimisticMutation({
        mutation: api.blog.rm,
        onOptimistic: () => {
          onOptimisticRemove?.()
        },
        onRollback: () => {
          toast.error('Failed to delete')
        },
        onSuccess: () => {
          toast.success('Deleted')
        }
      }),
      deleteTrigger = createElement(
        Button,
        {
          'aria-label': 'Delete blog',
          className: 'group-hover:block hover:bg-destructive/10 hover:text-destructive',
          size: 'icon',
          type: 'button',
          variant: 'ghost'
        },
        createElement(Trash, { className: 'size-full stroke-1' })
      )
    return isPending ? (
      <Spinner className='size-8' data-testid='delete-spinner' />
    ) : (
      <AlertDialog>
        <AlertDialogTrigger render={deleteTrigger} />
        <AlertDialogContent data-testid='delete-dialog'>
          <AlertDialogHeader>
            <AlertDialogTitle className='flex items-center gap-2'>Delete blog?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this blog, this action cannot be undone?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid='delete-cancel'>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid='delete-confirm'
              // eslint-disable-next-line @typescript-eslint/strict-void-return
              onClick={async () => execute({ id })}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  },
  Create = () => {
    const [open, setOpen] = useState(false),
      create = useMutation(api.blog.create),
      form = useForm({
        onSubmit: async d => {
          await create({ ...d, published: false })
          return d
        },
        onSuccess: () => {
          form.reset()
          setOpen(false)
          toast.success('Created')
        },
        schema: createBlog
      })
    return (
      <Dialog
        onOpenChange={v => {
          if (!form.isPending) setOpen(v)
        }}
        open={open}>
        <DialogTrigger asChild>
          <Button
            aria-label='Create blog post'
            className='fixed top-2 right-2 size-10 rounded-full bg-muted p-2 transition-all duration-300 hover:scale-110 hover:bg-border active:scale-75'
            data-testid='create-blog-trigger'
            size='icon'
            type='button'
            variant='ghost'>
            <Plus className='size-full' />
          </Button>
        </DialogTrigger>
        <DialogContent
          className='max-h-[90%] max-w-lg overflow-auto'
          data-testid='create-blog-dialog'
          onInteractOutside={e => {
            if (form.isPending) e.preventDefault()
          }}>
          <Form
            className='flex flex-col gap-4'
            form={form}
            render={({ Arr, Choose, File, Files, Submit, Text }) => (
              <>
                <FieldGroup>
                  <Text data-testid='blog-title' name='title' placeholder='My awesome post' />
                  <Choose data-testid='blog-category' name='category' placeholder='Select' />
                  <Text className='min-h-32' data-testid='blog-content' multiline name='content' placeholder='Write...' />
                  <File accept='image/*' data-testid='blog-cover-image' maxSize={5 * 1024 * 1024} name='coverImage' />
                  <Files
                    accept='image/*,application/pdf'
                    data-testid='blog-attachments'
                    maxSize={10 * 1024 * 1024}
                    name='attachments'
                  />
                  <Arr data-testid='blog-tags' name='tags' placeholder='Add tag...' transform={s => s.toLowerCase()} />
                </FieldGroup>
                <Submit className='ml-auto' data-testid='create-blog-submit' Icon={Send}>
                  Create
                </Submit>
              </>
            )}
          />
        </DialogContent>
      </Dialog>
    )
  },
  Author = ({
    _id: id,
    author,
    category,
    className,
    onOptimisticRemove,
    own,
    published,
    tags,
    updatedAt
  }: Blog & ComponentProps<'div'> & { onOptimisticRemove?: () => void }) => (
    <div className={cn('flex items-center', className)}>
      {author?.image ? (
        <Image alt='' className='rounded-full' height={32} src={author.image} width={32} />
      ) : (
        <UserRound className='size-8 shrink-0 rounded-full bg-border stroke-1 pt-0.5 text-background' />
      )}
      <div className='mx-2'>
        <p className='text-sm'>{author?.name ?? author?.email}</p>
        <div className='flex items-center gap-1 text-xs text-muted-foreground' title={format(updatedAt, 'PPPPpp')}>
          {formatDistance(updatedAt, new Date(), { addSuffix: true })}
          <p>•</p>
          <p className='rounded-full bg-muted-foreground px-1.5 text-background capitalize'>{category}</p>
          {tags && tags.length > 0 ? (
            <>
              <p>•</p>
              <p>{tags.map((tag: string) => `#${tag} `)}</p>
            </>
          ) : null}
        </div>
      </div>
      {own ? (
        <>
          <Publish className='mr-2 ml-auto' id={id} published={published} />
          <Button asChild className='group-hover:block' size='icon' variant='ghost'>
            <Link href={`/${id}/edit`}>
              <Pencil className='size-full stroke-1' />
            </Link>
          </Button>
          <Delete id={id} onOptimisticRemove={onOptimisticRemove} />
        </>
      ) : null}
    </div>
  ),
  Card = ({
    _id,
    content,
    coverImageUrl,
    onOptimisticRemove,
    title,
    ...rest
  }: Blog & { onOptimisticRemove?: () => void }) => (
    <div
      className='group -mt-0.5 w-full rounded-xs border-2 border-transparent px-2.5 pt-2 transition-all duration-300 hover:rounded-3xl hover:border-border'
      data-testid='blog-card'>
      <Author
        _id={_id}
        content={content}
        coverImageUrl={coverImageUrl}
        onOptimisticRemove={onOptimisticRemove}
        title={title}
        {...rest}
      />
      <Link className='mt-1 block' data-testid='blog-card-link' href={`/${_id}`}>
        {coverImageUrl ? (
          <img
            alt={title}
            className='my-1 w-full rounded-lg object-cover'
            data-testid='blog-cover-image'
            height={1000}
            src={coverImageUrl}
            width={1000}
          />
        ) : null}
        <p className='text-xl font-medium' data-testid='blog-card-title'>
          {title}
        </p>
        <p className='line-clamp-3 text-xs text-muted-foreground' data-testid='blog-card-content'>
          {content}
        </p>
      </Link>
      <Separator className='mx-3 mt-2.5 translate-y-px transition-all duration-500 group-hover:opacity-0' />
    </div>
  ),
  List = ({ blogs, onRemove }: { blogs: Blog[]; onRemove?: (id: Blog['_id']) => void }) =>
    blogs.length > 0 ? (
      <div data-testid='blog-list'>
        {blogs.map(b => (
          <Card key={b._id} onOptimisticRemove={onRemove ? () => onRemove(b._id) : undefined} {...b} />
        ))}
      </div>
    ) : (
      <p className='text-muted-foreground' data-testid='empty-state'>
        No posts yet
      </p>
    )
export { Author, Create, List }
