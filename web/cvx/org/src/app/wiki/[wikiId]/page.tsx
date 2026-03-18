/* oxlint-disable promise/prefer-await-to-then */

'use client'

import type { Id } from '@a/be-convex/model'

import { api } from '@a/be-convex'
import { fail } from '@a/fe/utils'
import { Badge } from '@a/ui/badge'
import { Button } from '@a/ui/button'
import { Skeleton } from '@a/ui/skeleton'
import { EditorsSection } from '@noboil/convex/components'
import { canEditResource, useOrgMutation, useOrgQuery } from '@noboil/convex/react'
import { useQuery } from 'convex/react'
import { Pencil, RotateCcw, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { use } from 'react'
import { toast } from 'sonner'

import { useOrg } from '~/hook/use-org'

const wikiRestore = (api.wiki as typeof api.wiki & { restore: typeof api.wiki.rm }).restore,
  WikiDetailPage = ({ params }: { params: Promise<{ wikiId: Id<'wiki'> }> }) => {
    const { wikiId } = use(params),
      { isAdmin } = useOrg(),
      me = useQuery(api.user.me, {}),
      wiki = useOrgQuery(api.wiki.read, { id: wikiId }),
      members = useOrgQuery(api.org.members),
      editorsList = useOrgQuery(api.wiki.editors, { wikiId }),
      addEditorMut = useOrgMutation(api.wiki.addEditor),
      removeEditorMut = useOrgMutation(api.wiki.removeEditor),
      restoreMut = useOrgMutation(wikiRestore)

    if (!(wiki && me && members && editorsList)) return <Skeleton className='h-40' />

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const isDeleted = wiki.deletedAt !== null,
      canEditWiki = canEditResource({ editorsList, isAdmin, resource: wiki, userId: me._id }),
      handleAddEditor = (userId: string) => {
        addEditorMut({ editorId: userId, wikiId })
          .then(() => toast.success('Editor added'))
          .catch(fail)
      },
      handleRemoveEditor = (userId: string) => {
        removeEditorMut({ editorId: userId, wikiId })
          .then(() => toast.success('Editor removed'))
          .catch(fail)
      },
      handleRestore = () => {
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
            <h1 className={`text-2xl font-bold ${isDeleted ? 'line-through opacity-60' : ''}`}>{wiki.title}</h1>
            {isDeleted ? (
              <Badge variant='destructive'>deleted</Badge>
            ) : canEditWiki ? null : (
              <Badge variant='secondary'>View only</Badge>
            )}
          </div>
          {canEditWiki && !isDeleted ? (
            <Button asChild variant='outline'>
              <Link href={`/wiki/${wikiId}/edit`}>
                <Pencil className='mr-2 size-4' />
                Edit
              </Link>
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
