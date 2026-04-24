'use client'
/* oxlint-disable eslint-plugin-promise(prefer-await-to-then) */
import { api } from '@a/be-convex'
import { Button } from '@a/ui/button'
import { FieldGroup } from '@a/ui/field'
import { useMutation } from 'convex/react'
import { Form, useFormMutation } from 'noboil/convex/components'
import { useKv, useList, useLog, useQuota } from 'noboil/convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { createPoll } from '~/schema'
interface Poll {
  _id: string
  options: string[]
  question: string
  updatedAt: number
}
interface VoteRow {
  _id: string
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
  const purge = async () => {
    await log.purge()
  }
  return (
    <div className='mt-3 space-y-2' data-testid='vote-view'>
      <div className='text-xs text-muted-foreground' data-testid='quota-remaining'>
        quota: {quota.state?.remaining ?? '—'}
      </div>
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
            log.appendBulk(options.map(opt => ({ optionIdx: options.indexOf(opt), voter: 'bulk' }))).catch(() => null)
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
const BannerAdmin = () => {
  const banner = useKv(api.siteConfig, 'banner') as {
    data: null | undefined | { active: boolean; message: string; updatedAt: number }
    remove: () => Promise<void>
    restore: () => Promise<void>
    update: (payload: { active: boolean; message: string }) => Promise<void>
  }
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
  const { data, hasMore, loadMore } = useList(api.poll.list, {})
  const polls = data as Poll[]
  const banner = useKv(api.siteConfig, 'banner') as { data: null | undefined | { active: boolean; message: string } }
  const [selectedPoll, setSelectedPoll] = useState<null | string>(null)
  const [query, setQuery] = useState('')
  const rmPoll = useMutation(api.poll.rm)
  const bannerDoc = banner.data
  const filtered = query ? polls.filter(p => p.question.toLowerCase().includes(query.toLowerCase())) : polls
  const del = async (id: string): Promise<void> => {
    await rmPoll({ id })
  }
  return (
    <div className='mx-auto max-w-2xl space-y-6 p-8' data-testid='poll-page'>
      {bannerDoc?.active ? (
        <div className='rounded-sm bg-muted p-3 text-sm' data-testid='poll-banner'>
          {bannerDoc.message}
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
        {filtered.map(p => (
          <li className='space-y-2 rounded-sm border p-4' data-testid='poll-item' key={p._id}>
            <div className='flex items-center justify-between'>
              <button className='text-left font-medium' onClick={() => setSelectedPoll(p._id)} type='button'>
                {p.question}
              </button>
              <Button
                data-testid={`poll-delete-${p._id}`}
                onClick={() => {
                  del(p._id).catch(() => null)
                }}
                size='sm'
                variant='ghost'>
                delete
              </Button>
            </div>
            {selectedPoll === p._id ? <VoteView options={p.options} pollId={p._id} /> : null}
          </li>
        ))}
      </ul>
      {hasMore ? (
        <Button data-testid='poll-load-more' onClick={() => loadMore(10)} size='sm' variant='outline'>
          load more
        </Button>
      ) : null}
    </div>
  )
}
export default Page
