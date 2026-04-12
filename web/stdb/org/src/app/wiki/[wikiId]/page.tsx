// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'
import type { OrgMember, Wiki } from '@a/be-spacetimedb/spacetimedb/types'
import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { sameIdentity } from '@a/fe/utils'
import { cn } from '@a/ui'
import { Badge } from '@a/ui/badge'
import { Button } from '@a/ui/button'
import { Skeleton } from '@a/ui/skeleton'
import { EditorsSection } from '@noboil/spacetimedb/components'
import { useMut } from '@noboil/spacetimedb/react'
import { Pencil, RotateCcw, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { use } from 'react'
import { toast } from 'sonner'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'
import { useOrg } from '~/hook/use-org'
import { useOrgTable } from '~/hook/use-org-table'
import { useProfileMap } from '~/hook/use-profile-map'
const WikiDetailPage = ({ params }: { params: Promise<{ wikiId: string }> }) => {
  const { wikiId } = use(params)
  const id = Number(wikiId)
  const { isAdmin, org } = useOrg()
  const { identity } = useSpacetimeDB()
  const [allWikis] = useTable(tables.wiki)
  const wiki = allWikis.find((w: Wiki) => w.id === id && w.orgId === Number(org._id))
  const updateWiki = useMut(reducers.updateWiki, { toast: { success: 'Wiki restored' } })
  const [members] = useOrgTable<OrgMember>(tables.orgMember)
  const profileByUserId = useProfileMap()
  const restoreMut = async (args: { id: number }) => {
    if (!wiki) return
    await updateWiki({
      content: wiki.content,
      deletedAt: undefined,
      editors: wiki.editors,
      expectedUpdatedAt: wiki.updatedAt,
      id: args.id,
      slug: wiki.slug,
      status: wiki.status,
      title: wiki.title
    })
  }
  if (!(wiki && identity)) return <Skeleton className='h-40' />
  const isDeleted = wiki.deletedAt !== undefined
  // oxlint-disable-next-line jsx-no-new-array-as-prop
  const editorsList = (wiki.editors ?? []).map(e => {
    const userId = e.toHexString()
    const profile = profileByUserId.get(userId)
    return { email: '', name: profile?.displayName ?? userId.slice(0, 8), userId }
  })
  const canEditWiki =
    isAdmin || sameIdentity(wiki.userId, identity) || editorsList.some(e => e.userId === identity.toHexString())
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
          <Button
            data-testid='restore-wiki-detail'
            onClick={() => {
              restoreMut({ id: wiki.id })
            }}
            size='sm'
            variant='outline'>
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
          <Button render={p => <Link {...p} href={`/wiki/${wikiId}/edit`} />} variant='outline'>
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
          // oxlint-disable-next-line jsx-no-new-array-as-prop
          members={members.map(m => {
            const userId = m.userId.toHexString()
            const profile = profileByUserId.get(userId)
            return { user: { email: undefined, name: profile?.displayName }, userId }
          })}
          onAdd={(userId: string) => {
            const member = members.find(m => m.userId.toHexString() === userId)
            if (!member) return
            const current = wiki.editors ?? []
            const next = [...current, member.userId]
            updateWiki({
              content: wiki.content,
              deletedAt: wiki.deletedAt,
              editors: next,
              expectedUpdatedAt: wiki.updatedAt,
              id: wiki.id,
              slug: wiki.slug,
              status: wiki.status,
              title: wiki.title
            })
            toast.success('Editor added')
          }}
          onRemove={(userId: string) => {
            const current = wiki.editors ?? []
            const next: typeof current = []
            for (const e of current) if (e.toHexString() !== userId) next.push(e)
            updateWiki({
              content: wiki.content,
              deletedAt: wiki.deletedAt,
              editors: next,
              expectedUpdatedAt: wiki.updatedAt,
              id: wiki.id,
              slug: wiki.slug,
              status: wiki.status,
              title: wiki.title
            })
            toast.success('Editor removed')
          }}
        />
      ) : null}
    </div>
  )
}
export default WikiDetailPage
