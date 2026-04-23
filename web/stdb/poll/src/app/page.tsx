/* oxlint-disable eslint-plugin-promise(prefer-await-to-then) */
'use client'
import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { Button } from '@a/ui/button'
import { FieldGroup } from '@a/ui/field'
import { Form, useFormMutation } from 'noboil/spacetimedb/components'
import { useKv, useList, useLog, useMut, useOwnRows, useQuota } from 'noboil/spacetimedb/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'
import { createPoll } from '~/schema'
const POLL_QUOTA = { durationMs: 60_000, limit: 30 }
const VoteView = ({ options, pollId }: { options: string[]; pollId: number }) => {
  const log = useLog<{ option: string; parent: string; seq: number }>(
    { append: reducers.appendVote, purgeByParent: reducers.purgeVoteByParent, table: tables.vote },
    { parent: String(pollId) }
  )
  const quota = useQuota(
    {
      config: POLL_QUOTA,
      consume: reducers.consumePollVoteQuota,
      record: reducers.recordPollVoteQuota,
      table: tables.pollVoteQuota
    },
    String(pollId)
  )
  const counts = options.map(opt => log.data.filter(v => v.option === opt).length)
  const vote = async (opt: string): Promise<void> => {
    if (!quota.state.allowed) {
      toast.error(`rate limit — retry in ${Math.ceil((quota.state.retryAfter ?? 0) / 1000)}s`)
      return
    }
    await quota.consume()
    await log.append({ payload: { option: opt } })
  }
  return (
    <div className='mt-3 space-y-2' data-testid='vote-view'>
      {options.map((opt, i) => (
        <div className='flex items-center gap-2' key={opt}>
          <Button
            data-testid={`vote-option-${i}`}
            disabled={!quota.state.allowed}
            onClick={() => {
              vote(opt).catch(() => null)
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
  const createMut = useMut<Record<string, unknown>>(reducers.createPoll)
  const form = useFormMutation({ mutate: createMut, schema: createPoll })
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
  const [allPolls, isReady] = useTable(tables.poll)
  const { identity } = useSpacetimeDB()
  const mine = useOwnRows(allPolls, identity ? (p: (typeof allPolls)[number]) => p.userId.isEqual(identity) : null)
  const { data: polls } = useList(mine, isReady, { sort: { direction: 'desc', field: 'id' } })
  const banner = useKv<{ active: boolean; key: string; message: string }>(
    { rm: reducers.rmSiteConfig, set: reducers.setSiteConfig, table: tables.siteConfig },
    'banner'
  )
  const [selected, setSelected] = useState<null | number>(null)
  return (
    <div className='mx-auto max-w-2xl space-y-6 p-8' data-testid='poll-page'>
      {banner.data?.active ? (
        <div className='rounded-sm bg-muted p-3 text-sm' data-testid='poll-banner'>
          {banner.data.message}
        </div>
      ) : null}
      <h1 className='text-2xl font-bold'>Polls</h1>
      <CreatePoll />
      <ul className='space-y-3'>
        {polls.map(p => (
          <li className='rounded-sm border p-4' data-testid='poll-item' key={p.id}>
            <button className='text-left font-medium' onClick={() => setSelected(p.id)} type='button'>
              {p.question}
            </button>
            {selected === p.id ? <VoteView options={p.options} pollId={p.id} /> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
export default Page
