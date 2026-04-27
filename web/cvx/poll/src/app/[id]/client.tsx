'use client'
/* oxlint-disable forbid-component-props, no-underscore-dangle -- shadcn/Tailwind pattern requires className/style on shared components / Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
import type { api } from '@a/be-convex'
import type { Preloaded } from 'convex/react'
import { Badge } from '@a/ui/badge'
import { Button } from '@a/ui/button'
import { usePreloadedQuery } from 'convex/react'
import { format, formatDistance } from 'date-fns'
import { Pencil } from 'lucide-react'
import Link from 'next/link'
const Client = ({ preloaded }: { preloaded: Preloaded<typeof api.poll.read> }) => {
  const p = usePreloadedQuery(preloaded)
  if (!p)
    return (
      <p className='py-8 text-center text-sm text-muted-foreground' data-testid='poll-not-found'>
        Poll not found
      </p>
    )
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
          data-testid='poll-detail-edit'
          nativeButton={false}
          render={pp => <Link {...pp} href={`/${p._id}/edit`} />}
          size='icon'
          variant='ghost'>
          <Pencil className='size-4 stroke-1' />
        </Button>
      </div>
      <p
        className='text-sm text-muted-foreground'
        data-testid='poll-detail-time'
        title={format(p._creationTime, 'PPPPpp')}>
        Created {formatDistance(p._creationTime, new Date(), { addSuffix: true })}
      </p>
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
export default Client
