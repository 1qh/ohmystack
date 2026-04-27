/* oxlint-disable promise/prefer-await-to-then */
/* oxlint-disable forbid-component-props, no-underscore-dangle -- shadcn/Tailwind pattern requires className/style on shared components / Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
'use client'
import type { Id } from '@a/be-convex/model'
import { api } from '@a/be-convex'
import { fail } from '@a/fe/utils'
import { cn } from '@a/ui'
import { Badge } from '@a/ui/badge'
import { Button } from '@a/ui/button'
import { Skeleton } from '@a/ui/skeleton'
import { useQuery } from 'convex/react'
import { Pencil, RotateCcw, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { EditorsSection } from 'noboil/convex/components'
import { canEditResource, useOrgMutation, useOrgQuery } from 'noboil/convex/react'
import { use } from 'react'
import { toast } from 'sonner'
import { useOrg } from '~/hook/use-org'
const wikiRestore = (api.wiki as typeof api.wiki & { restore: typeof api.wiki.rm }).restore
const WikiDetailPage = ({ params }: { params: Promise<{ wikiId: Id<'wiki'> }> }) => {
  const { wikiId } = use(params)
  const { isAdmin } = useOrg()
  const me = useQuery(api.user.me, {})
  const wiki = useOrgQuery(api.wiki.read, { id: wikiId })
  const members = useOrgQuery(api.org.members)
  const editorsList = useOrgQuery(api.wiki.editors, { wikiId })
  const addEditorMut = useOrgMutation(api.wiki.addEditor)
  const removeEditorMut = useOrgMutation(api.wiki.removeEditor)
  const restoreMut = useOrgMutation(wikiRestore)
  if (!(wiki && me && members && editorsList)) return <Skeleton className='h-40' />
  const isDeleted = wiki.deletedAt !== undefined
  const canEditWiki = canEditResource({ editorsList, isAdmin, resource: wiki, userId: me._id })
  const handleAddEditor = (userId: string) => {
    addEditorMut({ editorId: userId, wikiId })
      .then(() => toast.success('Editor added'))
      .catch(fail)
  }
  const handleRemoveEditor = (userId: string) => {
    removeEditorMut({ editorId: userId, wikiId })
      .then(() => toast.success('Editor removed'))
      .catch(fail)
  }
  const handleRestore = () => {
    restoreMut({ id: wikiId })
      .then(() => toast.success('Wiki restored'))
      .catch(fail)
  }
  return (
    <div className='space-y-6'>
      {isDeleted ? (
        <div
          className='flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3'
          data-testid='deleted-banner'>
          <div className='flex items-center gap-2 text-destructive'>
            <Trash2 className='size-4' />
            <span className='text-sm font-medium'>This wiki page has been deleted</span>
          </div>
          <Button data-testid='restore-wiki-detail' onClick={handleRestore} size='sm' variant='outline'>
            <RotateCcw className='mr-1.5 size-3.5' />
            Restore
          </Button>
        </div>
      ) : null}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-3'>
          <h1 className={cn('text-2xl font-bold', isDeleted && 'line-through opacity-60')}>{wiki.title}</h1>
          {isDeleted ? (
            <Badge variant='destructive'>deleted</Badge>
          ) : canEditWiki ? null : (
            <Badge variant='secondary'>View only</Badge>
          )}
        </div>
        {canEditWiki && !isDeleted ? (
          <Button nativeButton={false} render={p => <Link {...p} href={`/wiki/${wikiId}/edit`} />} variant='outline'>
            <Pencil className='mr-2 size-4' />
            Edit
          </Button>
        ) : null}
      </div>
      <div className='flex items-center gap-2'>
        <span className='text-sm text-muted-foreground'>{wiki.slug}</span>
        <Badge variant={wiki.status === 'published' ? 'default' : 'secondary'}>{wiki.status}</Badge>
      </div>
      {wiki.content ? <p className='text-muted-foreground'>{wiki.content}</p> : null}
      {isAdmin && !isDeleted ? (
        <EditorsSection
          editorsList={editorsList}
          members={members}
          onAdd={handleAddEditor}
          onRemove={handleRemoveEditor}
        />
      ) : null}
    </div>
  )
}
export default WikiDetailPage
