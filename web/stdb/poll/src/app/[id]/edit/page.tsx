'use client'
import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { FieldGroup } from '@a/ui/field'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Form, useFormMutation } from 'noboil/spacetimedb/components'
import { useMut } from 'noboil/spacetimedb/react'
import { toast } from 'sonner'
import { useTable } from 'spacetimedb/react'
import { createPoll } from '~/schema'
interface Poll {
  id: number
  options: string[]
  question: string
  updatedAt: number | { toDate: () => Date }
}
const Edit = ({ p }: { p: Poll }) => {
  const updateMut = useMut<Record<string, unknown>>(reducers.updatePoll)
  const form = useFormMutation({
    mutate: async d => updateMut({ ...d, id: p.id }),
    onSuccess: () => {
      toast.success('Poll saved')
    },
    schema: createPoll,
    values: { options: p.options, question: p.question }
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
const Page = () => {
  const params = useParams<{ id: string }>()
  const id = Number(params.id)
  const [polls, isReady] = useTable(tables.poll)
  const p = polls.find(row => row.id === id) as Poll | undefined
  if (!isReady)
    return (
      <p className='py-8 text-center text-sm text-muted-foreground' data-testid='poll-loading'>
        Loading…
      </p>
    )
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
        href={`/${p.id}`}>
        &larr; Back to poll
      </Link>
      <h1 className='text-2xl font-semibold'>Edit poll</h1>
      <Edit p={p} />
    </div>
  )
}
export default Page
