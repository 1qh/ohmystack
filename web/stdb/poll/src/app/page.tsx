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
    {
      append: reducers.appendVote,
      bulkAppend: reducers.bulkAppendVote,
      bulkRm: reducers.bulkRmVote,
      purgeByParent: reducers.purgeVoteByParent,
      restoreByParent: reducers.restoreVoteByParent,
      rm: reducers.rmVote,
      table: tables.vote,
      update: reducers.updateVote
    },
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
  const purge = async (): Promise<void> => {
    await log.purge()
  }
  return (
    <div className='mt-3 space-y-2' data-testid='vote-view'>
      <div className='text-xs text-muted-foreground' data-testid='quota-remaining'>
        quota: {quota.state.remaining}
      </div>
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
          <span className='text-sm text-muted-foreground' data-testid={`vote-count-${i}`}>
            {counts[i]} votes
          </span>
        </div>
      ))}
      <div className='flex gap-2'>
        <Button
          data-testid='vote-purge'
          onClick={() => {
            purge().catch(() => null)
          }}
          size='sm'
          variant='ghost'>
          purge votes
        </Button>
        <Button
          data-testid='vote-restore'
          onClick={() => {
            log.restore().catch(() => null)
          }}
          size='sm'
          variant='ghost'>
          restore votes
        </Button>
        <Button
          data-testid='vote-bulk'
          onClick={() => {
            log.appendBulk(options.map(opt => ({ option: opt }))).catch(() => null)
          }}
          size='sm'
          variant='ghost'>
          bulk +1 each
        </Button>
      </div>
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
const BannerAdmin = () => {
  const banner = useKv<{ active: boolean; key: string; message: string }>(
    {
      restore: reducers.restoreSiteConfig,
      rm: reducers.rmSiteConfig,
      set: reducers.setSiteConfig,
      table: tables.siteConfig
    },
    'banner'
  )
  const [message, setMessage] = useState('')
  const [active, setActive] = useState(true)
  const save = async (): Promise<void> => {
    await banner.update({ active, message })
    toast.success('banner saved')
  }
  const clear = async (): Promise<void> => {
    await banner.remove()
    toast.success('banner cleared')
  }
  return (
    <div className='space-y-2 rounded-sm border p-3' data-testid='banner-admin'>
      <input
        className='w-full rounded-sm border px-2 py-1 text-sm'
        data-testid='banner-message-input'
        onChange={e => setMessage(e.target.value)}
        placeholder='banner message'
        value={message}
      />
      <label className='flex items-center gap-2 text-sm'>
        <input
          checked={active}
          data-testid='banner-active-input'
          onChange={e => setActive(e.target.checked)}
          type='checkbox'
        />
        active
      </label>
      <div className='flex gap-2'>
        <Button
          data-testid='banner-save'
          onClick={() => {
            save().catch(() => null)
          }}
          size='sm'>
          save banner
        </Button>
        <Button
          data-testid='banner-clear'
          onClick={() => {
            clear().catch(() => null)
          }}
          size='sm'
          variant='outline'>
          clear banner
        </Button>
        <Button
          data-testid='banner-restore'
          onClick={() => {
            banner.restore().catch(() => null)
          }}
          size='sm'
          variant='outline'>
          restore banner
        </Button>
      </div>
      <div className='text-xs text-muted-foreground' data-testid='banner-state'>
        {banner.data ? `active=${banner.data.active} message=${banner.data.message}` : 'no banner'}
      </div>
    </div>
  )
}
const Page = () => {
  const [allPolls, isReady] = useTable(tables.poll)
  const { identity } = useSpacetimeDB()
  const mine = useOwnRows(allPolls, identity ? (p: (typeof allPolls)[number]) => p.userId.isEqual(identity) : null)
  const rmPoll = useMut<{ id: number }>(reducers.rmPoll)
  const [query, setQuery] = useState('')
  const filtered = query ? mine.filter(p => p.question.toLowerCase().includes(query.toLowerCase())) : mine
  const { data: polls } = useList(filtered, isReady, { sort: { direction: 'desc', field: 'id' } })
  const banner = useKv<{ active: boolean; key: string; message: string }>(
    { rm: reducers.rmSiteConfig, set: reducers.setSiteConfig, table: tables.siteConfig },
    'banner'
  )
  const [selected, setSelected] = useState<null | number>(null)
  const del = async (id: number): Promise<void> => {
    await rmPoll({ id })
  }
  return (
    <div className='mx-auto max-w-2xl space-y-6 p-8' data-testid='poll-page'>
      {banner.data?.active ? (
        <div className='rounded-sm bg-muted p-3 text-sm' data-testid='poll-banner'>
          {banner.data.message}
        </div>
      ) : null}
      <h1 className='text-2xl font-bold'>Polls</h1>
      <BannerAdmin />
      <CreatePoll />
      <input
        className='w-full rounded-sm border px-2 py-1'
        data-testid='poll-search-input'
        onChange={e => setQuery(e.target.value)}
        placeholder='search polls'
        value={query}
      />
      <ul className='space-y-3'>
        {polls.map(p => (
          <li className='space-y-2 rounded-sm border p-4' data-testid='poll-item' key={p.id}>
            <div className='flex items-center justify-between'>
              <button className='text-left font-medium' onClick={() => setSelected(p.id)} type='button'>
                {p.question}
              </button>
              <Button
                data-testid={`poll-delete-${p.id}`}
                onClick={() => {
                  del(p.id).catch(() => null)
                }}
                size='sm'
                variant='ghost'>
                delete
              </Button>
            </div>
            {selected === p.id ? <VoteView options={p.options} pollId={p.id} /> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
export default Page
