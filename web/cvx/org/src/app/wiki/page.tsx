/* oxlint-disable promise/prefer-await-to-then */
/* eslint-disable complexity */
'use client'
import { api } from '@a/be-convex'
import { fail } from '@a/fe/utils'
import { Badge } from '@a/ui/badge'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { Checkbox } from '@a/ui/checkbox'
import { Skeleton } from '@a/ui/skeleton'
import { useBulkSelection, useOrgMutation, useOrgQuery } from '@noboil/convex/react'
import { useMutation } from 'convex/react'
import { FileText, Plus, RotateCcw, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { useOrg } from '~/hook/use-org'
const wikiRestore = (api.wiki as typeof api.wiki & { restore: typeof api.wiki.rm }).restore,
  WikiPage = () => {
    const { isAdmin, org } = useOrg(),
      [showDeleted, setShowDeleted] = useState(false),
      wikis = useOrgQuery(api.wiki.list, showDeleted ? 'skip' : { paginationOpts: { cursor: null, numItems: 100 } }),
      deletedWikis = useOrgQuery(api.wiki.listDeleted, showDeleted ? {} : 'skip'),
      restoreMut = useOrgMutation(wikiRestore),
      { clear, handleBulkDelete, selected, toggleSelect, toggleSelectAll } = useBulkSelection({
        items: wikis?.page ?? [],
        onError: (e: unknown) => {
          fail(e)
        },
        orgId: org._id,
        restore: restoreMut,
        rm: useMutation(api.wiki.rm),
        toast: (msg, opts) => {
          toast(msg, opts)
        },
        undoLabel: 'wiki page'
      })
    if (showDeleted && !deletedWikis) return <Skeleton className='h-40' />
    if (!(showDeleted || wikis)) return <Skeleton className='h-40' />
    const activeItems = showDeleted ? [] : (wikis?.page ?? []),
      deletedItems = deletedWikis ?? [],
      visibleCount = showDeleted ? deletedItems.length : activeItems.length
    return (
      <div className='space-y-6'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-4'>
            <h1 className='text-2xl font-bold'>
              Wiki <span className='text-base font-normal text-muted-foreground'>({visibleCount})</span>
            </h1>
            {isAdmin && !showDeleted && selected.size > 0 ? (
              <div className='flex items-center gap-2'>
                <span className='text-sm text-muted-foreground'>{selected.size} selected</span>
                <Button
                  onClick={() => {
                    handleBulkDelete()
                  }}
                  size='sm'
                  variant='destructive'>
                  Delete
                </Button>
                <Button onClick={clear} size='sm' variant='ghost'>
                  Clear
                </Button>
              </div>
            ) : null}
          </div>
          <div className='flex items-center gap-2'>
            <Button
              className={showDeleted ? 'border-destructive/50 text-destructive' : ''}
              data-testid='trash-toggle'
              onClick={() => {
                setShowDeleted(v => !v)
                clear()
              }}
              size='sm'
              variant='outline'>
              <Trash2 className='mr-1.5 size-3.5' />
              Trash
            </Button>
            {showDeleted ? null : (
              <Button asChild>
                <Link href='/wiki/new'>
                  <Plus className='mr-2 size-4' />
                  New wiki
                </Link>
              </Button>
            )}
          </div>
        </div>
        {showDeleted ? (
          deletedItems.length === 0 ? (
            <Card>
              <CardContent className='flex flex-col items-center gap-2 py-8 text-center'>
                <Trash2 className='size-12 text-muted-foreground/50' />
                <p className='text-muted-foreground'>No deleted wiki pages</p>
              </CardContent>
            </Card>
          ) : (
            <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
              {deletedItems.map(w => (
                <Card className='border-dashed opacity-60' data-testid='deleted-wiki-item' key={w._id}>
                  <CardHeader>
                    <div className='flex items-center justify-between'>
                      <CardTitle className='line-through'>{w.title}</CardTitle>
                      <Badge variant='destructive'>deleted</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className='flex items-center justify-between'>
                    <span className='text-sm text-muted-foreground'>{w.slug}</span>
                    <Button
                      data-testid='restore-wiki'
                      onClick={() => {
                        restoreMut({ id: w._id }).catch(fail)
                      }}
                      size='sm'
                      variant='outline'>
                      <RotateCcw className='mr-1.5 size-3.5' />
                      Restore
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : activeItems.length === 0 ? (
          <Card>
            <CardContent className='flex flex-col items-center py-8 text-center'>
              <FileText className='mb-2 size-12 text-muted-foreground' />
              <p className='text-muted-foreground'>No wiki pages yet</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {isAdmin && activeItems.length > 0 ? (
              <div className='flex items-center gap-2'>
                <Checkbox
                  aria-label='Select all wiki pages'
                  checked={selected.size === activeItems.length}
                  onCheckedChange={toggleSelectAll}
                />
                <span className='text-sm text-muted-foreground'>Select all</span>
              </div>
            ) : null}
            <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
              {activeItems.map(w => (
                <div className='relative' key={w._id}>
                  {isAdmin ? (
                    <Checkbox
                      aria-label={`Select ${w.title}`}
                      checked={selected.has(w._id)}
                      className='absolute top-2 left-2 z-10'
                      onCheckedChange={() => toggleSelect(w._id)}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : null}
                  <Link href={`/wiki/${w._id}`}>
                    <Card className='transition-colors hover:bg-muted'>
                      <CardHeader className={isAdmin ? 'pl-10' : ''}>
                        <CardTitle>{w.title}</CardTitle>
                      </CardHeader>
                      <CardContent className='flex items-center gap-2'>
                        <span className='text-sm text-muted-foreground'>{w.slug}</span>
                        <Badge variant={w.status === 'published' ? 'default' : 'secondary'}>{w.status}</Badge>
                      </CardContent>
                    </Card>
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }
export default WikiPage
