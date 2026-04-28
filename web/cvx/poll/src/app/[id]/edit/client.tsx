'use client'
/* oxlint-disable eslint(no-underscore-dangle) */
import type { Preloaded } from 'convex/react'
import { api } from '@a/be-convex'
import { FieldGroup } from '@a/ui/field'
import { useMutation, usePreloadedQuery } from 'convex/react'
import Link from 'next/link'
import { Form, useForm } from 'noboil/convex/components'
import { toast } from 'sonner'
import { createPoll } from '~/schema'
const Edit = ({
  options,
  pollId,
  question,
  updatedAt
}: {
  options: string[]
  pollId: string
  question: string
  updatedAt: number
}) => {
  const update = useMutation(api.poll.update)
  const form = useForm({
    onSubmit: async d => {
      await update({ id: pollId, ...d, expectedUpdatedAt: updatedAt })
      return d
    },
    onSuccess: () => {
      toast.success('Poll saved')
    },
    schema: createPoll,
    values: { options, question }
  })
  return (
    <Form
      className='flex flex-col gap-4'
      data-testid='poll-edit-form'
      form={form}
      render={({ Arr, Submit, Text }) => (
        <>
          <FieldGroup>
            <Text data-testid='edit-poll-question' name='question' placeholder='Question' required />
            <Arr data-testid='edit-poll-options' name='options' placeholder='Add option…' />
          </FieldGroup>
          <Submit className='ml-auto' data-testid='edit-poll-submit'>
            Save
          </Submit>
        </>
      )}
    />
  )
}
const Client = ({ preloaded }: { preloaded: Preloaded<typeof api.poll.read> }) => {
  const p = usePreloadedQuery(preloaded)
  if (!p)
    return (
      <p className='py-8 text-center text-sm text-muted-foreground' data-testid='poll-not-found'>
        Poll not found
      </p>
    )
  return (
    <div className='mx-auto max-w-2xl space-y-4 p-6' data-testid='poll-edit-page'>
      <Link
        className='inline-block text-sm text-muted-foreground hover:text-primary'
        data-testid='edit-back'
        href={`/${p._id}`}>
        &larr; Back to poll
      </Link>
      <h1 className='text-2xl font-semibold'>Edit poll</h1>
      <Edit options={p.options} pollId={p._id} question={p.question} updatedAt={p.updatedAt} />
    </div>
  )
}
export default Client
