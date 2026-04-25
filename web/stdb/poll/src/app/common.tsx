/* eslint-disable @typescript-eslint/strict-void-return */
/* oxlint-disable promise/prefer-await-to-then */
'use client'
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
import { Badge } from '@a/ui/badge'
import { Button } from '@a/ui/button'
import { Checkbox } from '@a/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@a/ui/collapsible'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@a/ui/dialog'
import { FieldGroup } from '@a/ui/field'
import { Input } from '@a/ui/input'
import { Progress } from '@a/ui/progress'
import { format, formatDistance } from 'date-fns'
import { ChevronDown, Plus, Send, Trash } from 'lucide-react'
import { Form, useFormMutation } from 'noboil/spacetimedb/components'
import { useKv, useLog, useMut, useOptimisticMutation, useQuota } from 'noboil/spacetimedb/react'
import { createElement, useState } from 'react'
import { toast } from 'sonner'
import { createPoll } from '~/schema'
interface Poll {
  id: number
  options: string[]
  question: string
}
const POLL_QUOTA = { durationMs: 60_000, limit: 30 }
const Create = () => {
  const [open, setOpen] = useState(false)
  const createMut = useMut<Record<string, unknown>>(reducers.createPoll)
  const form = useFormMutation({
    mutate: createMut,
    onSuccess: () => {
      form.reset()
      setOpen(false)
      toast.success('Poll created')
    },
    schema: createPoll
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
            aria-label='Create poll'
            className='fixed top-2 right-2 z-10 size-10 rounded-full bg-muted p-2 transition-all duration-300 hover:scale-110 hover:bg-border active:scale-75'
            data-testid='create-poll-trigger'
            size='icon'
            type='button'
            variant='ghost'
          />
        )}>
        <Plus className='size-full' />
      </DialogTrigger>
      <DialogContent className='max-w-md' data-testid='create-poll-dialog'>
        <DialogTitle>New poll</DialogTitle>
        <Form
          className='flex flex-col gap-4'
          data-testid='poll-create-form'
          form={form}
          render={({ Arr, Submit, Text }) => (
            <>
              <FieldGroup>
                <Text data-testid='poll-question' name='question' placeholder='Your question' required />
                <Arr data-testid='poll-options' name='options' placeholder='Add option…' />
              </FieldGroup>
              <Submit className='ml-auto' data-testid='poll-create-submit' Icon={Send}>
                Create poll
              </Submit>
            </>
          )}
        />
      </DialogContent>
    </Dialog>
  )
}
const DeletePoll = ({ id, onOptimisticRemove }: { id: number; onOptimisticRemove?: () => void }) => {
  const rmPoll = useMut<{ id: number }>(reducers.rmPoll)
  const { execute } = useOptimisticMutation<{ id: number }>({
    mutate: async args => rmPoll(args),
    onOptimistic: () => {
      onOptimisticRemove?.()
    },
    onRollback: () => {
      toast.error('Delete failed')
    },
    onSuccess: () => {
      toast.success('Poll deleted')
    }
  })
  const trigger = createElement(
    Button,
    {
      'aria-label': 'Delete poll',
      className: 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
      size: 'icon',
      type: 'button',
      variant: 'ghost'
    },
    createElement(Trash, { className: 'size-4 stroke-1.5' })
  )
  return (
    <AlertDialog>
      <AlertDialogTrigger data-testid={`poll-delete-${id}`} render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete poll?</AlertDialogTitle>
          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              await execute({ id })
            }}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
const VoteAdmin = ({
  appendBulk,
  options,
  purge,
  restore
}: {
  appendBulk: () => Promise<void>
  options: string[]
  purge: () => Promise<void>
  restore: () => Promise<void>
}) => {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible className='mt-2' onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger
        render={p => (
          <button
            {...p}
            className='flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
            type='button'>
            <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
            Admin actions ({options.length} options)
          </button>
        )}
      />
      <CollapsibleContent className='mt-2 flex gap-2'>
        <Button
          data-testid='vote-purge'
          onClick={() => {
            purge().catch(() => null)
          }}
          size='sm'
          variant='outline'>
          Purge votes
        </Button>
        <Button
          data-testid='vote-restore'
          onClick={() => {
            restore().catch(() => null)
          }}
          size='sm'
          variant='outline'>
          Restore votes
        </Button>
        <Button
          data-testid='vote-bulk'
          onClick={() => {
            appendBulk().catch(() => null)
          }}
          size='sm'
          variant='outline'>
          Bulk +1 each
        </Button>
      </CollapsibleContent>
    </Collapsible>
  )
}
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
  const total = counts.reduce((s, n) => s + n, 0)
  const { allowed } = quota.state
  const { remaining } = quota.state
  const vote = async (opt: string) => {
    if (!allowed) {
      toast.error(`Rate limit — retry in ${Math.ceil((quota.state.retryAfter ?? 0) / 1000)}s`)
      return
    }
    await quota.consume()
    await log.append({ payload: { option: opt } })
  }
  return (
    <div className='mt-3 space-y-3' data-testid='vote-view'>
      <div className='space-y-2'>
        {options.map((opt, i) => {
          const c = counts[i] ?? 0
          const pct = total ? Math.round((c / total) * 100) : 0
          return (
            <div className='space-y-1' key={opt}>
              <div className='flex items-center gap-2'>
                <Button
                  className='flex-1 justify-start'
                  data-testid={`vote-option-${i}`}
                  disabled={!allowed}
                  onClick={() => {
                    vote(opt).catch(() => null)
                  }}
                  size='sm'
                  variant='outline'>
                  {opt}
                </Button>
                <span className='w-16 text-right text-sm tabular-nums' data-testid={`vote-count-${i}`}>
                  {c} {c === 1 ? 'vote' : 'votes'}
                </span>
              </div>
              <Progress className='h-1' value={pct} />
            </div>
          )
        })}
      </div>
      <div className='flex items-center justify-between text-xs text-muted-foreground'>
        <span>
          {total} total {total === 1 ? 'vote' : 'votes'}
        </span>
        <span data-testid='quota-remaining'>{remaining} left this minute</span>
      </div>
      <VoteAdmin
        appendBulk={async () => log.appendBulk(options.map(opt => ({ option: opt }))).then(() => undefined)}
        options={options}
        purge={async () => log.purge().then(() => undefined)}
        restore={async () => log.restore().then(() => undefined)}
      />
    </div>
  )
}
const PollCard = ({ onOptimisticRemove, p }: { onOptimisticRemove?: () => void; p: Poll }) => {
  const [open, setOpen] = useState(false)
  const created = (p as Poll & { createdAt?: number | undefined | { toDate: () => Date } }).createdAt
  const createdDate =
    typeof created === 'number' ? new Date(created) : created && typeof created === 'object' ? created.toDate() : null
  return (
    <Collapsible
      className='rounded-lg border bg-card p-4 transition-shadow hover:shadow-sm'
      data-testid='poll-item'
      onOpenChange={setOpen}
      open={open}>
      <div className='flex items-center justify-between gap-2'>
        <CollapsibleTrigger
          render={p2 => (
            <button {...p2} className='flex-1 text-left' type='button'>
              <p className='font-medium hover:text-primary' data-testid='poll-card-question'>
                {p.question}
              </p>
              {createdDate ? (
                <p
                  className='text-xs text-muted-foreground'
                  data-testid='poll-card-time'
                  title={format(createdDate, 'PPPPpp')}>
                  {formatDistance(createdDate, new Date(), { addSuffix: true })}
                </p>
              ) : null}
            </button>
          )}
        />
        <Badge variant='outline'>
          {p.options.length} {p.options.length === 1 ? 'option' : 'options'}
        </Badge>
        <DeletePoll id={p.id} onOptimisticRemove={onOptimisticRemove} />
      </div>
      <CollapsibleContent>
        <VoteView options={p.options} pollId={p.id} />
      </CollapsibleContent>
    </Collapsible>
  )
}
const PollList = ({ onRemove, polls }: { onRemove?: (id: number) => void; polls: Poll[] }) =>
  polls.length > 0 ? (
    <div className='space-y-3' data-testid='poll-list'>
      {polls.map(p => (
        <PollCard key={p.id} onOptimisticRemove={onRemove ? () => onRemove(p.id) : undefined} p={p} />
      ))}
    </div>
  ) : (
    <p className='py-8 text-center text-sm text-muted-foreground' data-testid='empty-state'>
      No polls yet — create one above.
    </p>
  )
const BannerDisplay = () => {
  const banner = useKv<{ active: boolean; key: string; message: string }>(
    { rm: reducers.rmSiteConfig, set: reducers.setSiteConfig, table: tables.siteConfig },
    'banner'
  )
  const d = banner.data
  return d?.active ? (
    <div className='rounded-md border-l-4 border-primary bg-muted px-3 py-2 text-sm' data-testid='poll-banner'>
      {d.message}
    </div>
  ) : null
}
const BannerAdmin = () => {
  const [open, setOpen] = useState(false)
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
  const save = async () => {
    await banner.update({ active, message })
    toast.success('Banner saved')
  }
  const clear = async () => {
    await banner.remove()
    toast.success('Banner cleared')
  }
  const d = banner.data
  return (
    <Collapsible
      className='rounded-md border border-dashed bg-muted/40 px-3 py-2'
      data-testid='banner-admin'
      onOpenChange={setOpen}
      open={open}>
      <CollapsibleTrigger
        render={p => (
          <button
            {...p}
            className='flex w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
            type='button'>
            <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
            Site banner admin
            <span className='ml-auto' data-testid='banner-state'>
              {d ? `active=${String(d.active)} message=${d.message}` : 'no banner'}
            </span>
          </button>
        )}
      />
      <CollapsibleContent className='mt-2 space-y-2'>
        <Input
          data-testid='banner-message-input'
          onChange={e => setMessage(e.target.value)}
          placeholder='Banner message'
          value={message}
        />
        <div className='flex items-center gap-2 text-sm'>
          <Checkbox checked={active} data-testid='banner-active-input' onCheckedChange={v => setActive(v)} />
          <span>Active</span>
        </div>
        <div className='flex gap-2'>
          <Button
            data-testid='banner-save'
            onClick={() => {
              save().catch(() => null)
            }}
            size='sm'>
            Save
          </Button>
          <Button
            data-testid='banner-clear'
            onClick={() => {
              clear().catch(() => null)
            }}
            size='sm'
            variant='outline'>
            Clear
          </Button>
          <Button
            data-testid='banner-restore'
            onClick={() => {
              banner.restore().catch(() => null)
            }}
            size='sm'
            variant='ghost'>
            Restore
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
export { BannerAdmin, BannerDisplay, Create, PollList }
export type { Poll }
