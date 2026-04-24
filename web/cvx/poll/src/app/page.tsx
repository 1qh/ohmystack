'use client'
/* oxlint-disable eslint-plugin-promise(prefer-await-to-then) */
import { api } from '@a/be-convex'
import { Button } from '@a/ui/button'
import { FieldGroup } from '@a/ui/field'
import { Form, useFormMutation } from 'noboil/convex/components'
import { useCrud, useKv, useLog, useQuota } from 'noboil/convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { createPoll } from '~/schema'
interface Poll {
  _id: string
  options: string[]
  question: string
}
interface VoteRow {
  optionIdx: number
}
const VoteView = ({ options, pollId }: { options: string[]; pollId: string }) => {
  const log = useLog(api.vote, { parent: pollId })
  const quota = useQuota(api.pollVoteQuota, pollId)
  const votes = log.data as unknown as VoteRow[]
  const counts = options.map((_, i) => votes.filter(v => v.optionIdx === i).length)
  const vote = async (idx: number): Promise<void> => {
    const result = await quota.consume()
    if (!result.allowed) {
      toast.error(`rate limit — retry in ${Math.ceil((result.retryAfter ?? 0) / 1000)}s`)
      return
    }
    await log.append({ payload: { optionIdx: idx, voter: 'anon' } })
  }
  return (
    <div className='mt-3 space-y-2' data-testid='vote-view'>
      {options.map((opt, i) => (
        <div className='flex items-center gap-2' key={opt}>
          <Button
            data-testid={`vote-option-${i}`}
            disabled={quota.state ? !quota.state.allowed : false}
            onClick={() => {
              vote(i).catch(() => null)
            }}
            size='sm'
            variant='outline'>
            {opt}
          </Button>
          <span className='text-sm text-muted-foreground'>{counts[i]} votes</span>
        </div>
      ))}
    </div>
  )
}
const CreatePoll = () => {
  const form = useFormMutation({ mutation: api.poll.create, schema: createPoll })
  return (
    <Form
      className='flex flex-col gap-3'
      data-testid='poll-create-form'
      form={form}
      render={({ Arr, Submit, Text }) => (
        <>
          <FieldGroup>
            <Text data-testid='poll-question' name='question' placeholder='Your question' required />
            <Arr data-testid='poll-options' name='options' placeholder='option' />
          </FieldGroup>
          <Submit data-testid='poll-create-submit'>Create poll</Submit>
        </>
      )}
    />
  )
}
const Page = () => {
  const polls = useCrud(api.poll) as unknown as { data: Poll[] }
  const banner = useKv(api.siteConfig, 'banner')
  const [selectedPoll, setSelectedPoll] = useState<null | string>(null)
  const bannerDoc = banner.data as null | undefined | { value: string }
  return (
    <div className='mx-auto max-w-2xl space-y-6 p-8' data-testid='poll-page'>
      {bannerDoc ? (
        <div className='rounded-sm bg-muted p-3 text-sm' data-testid='poll-banner'>
          {bannerDoc.value}
        </div>
      ) : null}
      <h1 className='text-2xl font-bold'>Polls</h1>
      <CreatePoll />
      <ul className='space-y-3'>
        {polls.data.map(p => (
          <li className='rounded-sm border p-4' data-testid='poll-item' key={p._id}>
            <button className='text-left font-medium' onClick={() => setSelectedPoll(p._id)} type='button'>
              {p.question}
            </button>
            {selectedPoll === p._id ? <VoteView options={p.options} pollId={p._id} /> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
export default Page
