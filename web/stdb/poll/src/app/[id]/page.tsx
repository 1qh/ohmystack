'use client'
import { tables } from '@a/be-spacetimedb/spacetimedb'
import { Badge } from '@a/ui/badge'
import { Button } from '@a/ui/button'
import { format, formatDistance } from 'date-fns'
import { Pencil } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTable } from 'spacetimedb/react'
const Page = () => {
  const params = useParams<{ id: string }>()
  const id = Number(params.id)
  const [polls, isReady] = useTable(tables.poll)
  const p = polls.find(row => row.id === id) ?? null
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
  const created = (p as { createdAt?: number | { toDate?: () => Date } }).createdAt
  const createdDate = typeof created === 'number' ? new Date(created) : created?.toDate ? created.toDate() : null
  return (
    <div className='mx-auto max-w-2xl space-y-4 p-6' data-testid='poll-detail-page'>
      <Link className='inline-block text-sm text-muted-foreground hover:text-primary' data-testid='detail-back' href='/'>
        &larr; Back to polls
      </Link>
      <div className='flex items-start justify-between gap-3'>
        <h1 className='text-3xl font-bold' data-testid='poll-detail-question'>
          {p.question}
        </h1>
        <Button
          aria-label='Edit poll'
          data-testid='poll-detail-edit'
          nativeButton={false}
          render={pp => <Link {...pp} href={`/${p.id}/edit`} />}
          size='icon'
          variant='ghost'>
          <Pencil className='size-4 stroke-1' />
        </Button>
      </div>
      {createdDate ? (
        <p className='text-sm text-muted-foreground' data-testid='poll-detail-time' title={format(createdDate, 'PPPPpp')}>
          Created {formatDistance(createdDate, new Date(), { addSuffix: true })}
        </p>
      ) : null}
      <ul className='space-y-2' data-testid='poll-detail-options'>
        {p.options.map(opt => (
          <li className='rounded-md border bg-card px-3 py-2' key={opt}>
            <div className='flex items-center justify-between'>
              <span>{opt}</span>
              <Badge variant='outline'>option</Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
export default Page
