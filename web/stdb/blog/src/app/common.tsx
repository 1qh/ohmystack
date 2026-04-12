/* eslint-disable @next/next/no-img-element */
/* oxlint-disable jsx-no-jsx-as-prop, @next/next/no-img-element */
// biome-ignore-all lint/performance/noImgElement: x
// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
'use client'
import type { Blog } from '@a/be-spacetimedb/spacetimedb/types'
import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
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
import { Form, useFormMutation } from '@noboil/spacetimedb/components'
import { useMut, useOptimisticMutation, useResolveFileUrl } from '@noboil/spacetimedb/react'
import { format, formatDistance } from 'date-fns'
import { Pencil, Plus, Send, Trash, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'
import { createBlog } from '~/schema'
import { Publish } from './[id]/edit/client'
const isPlaywrightTest = process.env.NEXT_PUBLIC_PLAYWRIGHT === '1'
const Delete = ({ id, onOptimisticRemove }: { id: number; onOptimisticRemove?: () => void }) => {
  const rmBlog = useMut(reducers.rmBlog, {
    toast: { error: 'Delete failed', success: 'Deleted' }
  })
  const { execute, isPending } = useOptimisticMutation({
    mutate: rmBlog,
    onOptimistic: () => {
      onOptimisticRemove?.()
    },
    onRollback: () => {
      toast.error('Failed to delete')
    }
  })
  return isPending ? (
    <Spinner className='size-8' data-testid='delete-spinner' />
  ) : (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            aria-label='Delete blog'
            className='group-hover:block hover:bg-destructive/10 hover:text-destructive'
            data-testid='delete-blog-trigger'
            size='icon'
            type='button'
            variant='ghost'>
            <Trash className='size-full stroke-1' />
          </Button>
        }
      />
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
            onClick={() => {
              execute({ id })
            }}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
const Create = () => {
  const [open, setOpen] = useState(false)
  const form = useFormMutation({
    mutate: useReducer(reducers.createBlog),
    onSuccess: () => setOpen(false),
    schema: createBlog,
    toast: { success: 'Created' },
    transform: d => ({ ...d, published: false })
  })
  return (
    <Dialog
      onOpenChange={v => {
        if (!form.isPending) setOpen(v)
      }}
      open={open}>
      <DialogTrigger
        render={p => (
          <Button
            {...p}
            aria-label='Create blog post'
            className='fixed top-2 right-2 size-10 rounded-full bg-muted p-2 transition-all duration-300 hover:scale-110 hover:bg-border active:scale-75'
            data-testid='create-blog-trigger'
            size='icon'
            type='button'
            variant='ghost'
          />
        )}>
        <Plus className='size-full' />
      </DialogTrigger>
      <DialogContent className='max-h-[90%] max-w-lg overflow-auto' data-testid='create-blog-dialog'>
        <Form
          className='flex flex-col gap-4'
          form={form}
          render={({ Arr, Choose, File, Files, Submit, Text }) => (
            <>
              <FieldGroup>
                <Text
                  data-testid='blog-title'
                  helpText='Use a concise, clear title.'
                  name='title'
                  placeholder='My awesome post'
                  required
                />
                <Choose
                  data-testid='blog-category'
                  helpText='Choose the best matching topic.'
                  name='category'
                  placeholder='Select'
                  required
                />
                <Text
                  className='min-h-32'
                  data-testid='blog-content'
                  helpText='At least 3 characters.'
                  multiline
                  name='content'
                  placeholder='Write...'
                  required
                />
                <File
                  accept='image/*'
                  data-testid='blog-cover-image'
                  helpText='Optional cover image.'
                  maxSize={5 * 1024 * 1024}
                  name='coverImage'
                />
                <Files
                  accept='image/*,application/pdf'
                  data-testid='blog-attachments'
                  helpText='Optional attachments, up to 5 files.'
                  maxSize={10 * 1024 * 1024}
                  name='attachments'
                />
                <Arr
                  data-testid='blog-tags'
                  helpText='Press Enter to add each tag.'
                  name='tags'
                  placeholder='Add tag...'
                  transform={s => s.toLowerCase()}
                />
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
}
const Author = ({
  category,
  className,
  id,
  onOptimisticRemove,
  published,
  tags,
  updatedAt,
  userId
}: Blog & { className?: string; onOptimisticRemove?: () => void }) => {
  const { identity } = useSpacetimeDB()
  const [profiles] = useTable(tables.blogProfile)
  const authorProfile = profiles.find(p => p.userId.isEqual(userId))
  const authorName = authorProfile?.displayName ?? 'Author'
  const avatarUrl = useResolveFileUrl(authorProfile?.avatar)
  const own = isPlaywrightTest || (identity ? userId.isEqual(identity) : false)
  const updatedAtDate = updatedAt.toDate()
  return (
    <div className={cn('flex items-center', className)}>
      {avatarUrl ? (
        <img
          alt={authorName}
          className='size-8 shrink-0 rounded-full object-cover'
          height={32}
          src={avatarUrl}
          width={32}
        />
      ) : (
        <UserRound className='size-8 shrink-0 rounded-full bg-border stroke-1 pt-0.5 text-background' />
      )}
      <div className='mx-2'>
        <p className='text-sm'>{authorName}</p>
        <div className='flex items-center gap-1 text-xs text-muted-foreground' title={format(updatedAtDate, 'PPPPpp')}>
          {formatDistance(updatedAtDate, new Date(), { addSuffix: true })}
          <p>•</p>
          <p className='rounded-full bg-muted-foreground px-1.5 text-background capitalize'>{category}</p>
          {tags && tags.length > 0 ? (
            <>
              <p>•</p>
              <p>{tags.map(tag => `#${tag} `)}</p>
            </>
          ) : null}
        </div>
      </div>
      {own ? (
        <>
          <Publish className='mr-2 ml-auto' id={id} published={published} />
          <Button
            className='group-hover:block'
            render={p => <Link {...p} href={`/${id}/edit`} />}
            size='icon'
            variant='ghost'>
            <Pencil className='size-full stroke-1' />
          </Button>
          <Delete id={id} onOptimisticRemove={onOptimisticRemove} />
        </>
      ) : null}
    </div>
  )
}
const Card = ({
  content,
  coverImage,
  id,
  onOptimisticRemove,
  title,
  ...rest
}: Blog & { onOptimisticRemove?: () => void }) => {
  const resolvedCover = useResolveFileUrl(coverImage)
  return (
    <div
      className='group -mt-0.5 w-full rounded-xs border-2 border-transparent px-2.5 pt-2 transition-all duration-300 hover:rounded-3xl hover:border-border'
      data-testid='blog-card'>
      <Author
        content={content}
        coverImage={coverImage}
        id={id}
        onOptimisticRemove={onOptimisticRemove}
        title={title}
        {...rest}
      />
      <Link className='mt-1 block' data-testid='blog-card-link' href={`/${id}`}>
        {resolvedCover ? (
          <img
            alt={title}
            className='my-1 w-full rounded-lg object-cover'
            data-testid='blog-cover-image'
            height={1000}
            src={resolvedCover}
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
  )
}
const List = ({ blogs, onRemove }: { blogs: Blog[]; onRemove?: (id: number) => void }) =>
  blogs.length > 0 ? (
    <div data-testid='blog-list'>
      {blogs.map(b => (
        <Card key={b.id} onOptimisticRemove={onRemove ? () => onRemove(b.id) : undefined} {...b} />
      ))}
    </div>
  ) : (
    <p className='text-muted-foreground' data-testid='empty-state'>
      No posts yet
    </p>
  )
export { Author, Create, List }
