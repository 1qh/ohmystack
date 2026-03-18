// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'

import type { Wiki } from '@a/be-spacetimedb/spacetimedb/types'

import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { sameIdentity } from '@a/fe/utils'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { Skeleton } from '@a/ui/skeleton'
import { AutoSaveIndicator, Form, PermissionGuard, useFormMutation } from '@noboil/spacetimedb/components'
import { useMut } from '@noboil/spacetimedb/react'
import { pickValues } from '@noboil/spacetimedb/zod'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'

import { useOrg } from '~/hook/use-org'
import { wiki as wikiSchema } from '~/schema'

const EditWikiForm = ({ wikiId }: { wikiId: number }) => {
    const router = useRouter(),
      { org } = useOrg(),
      [wikis] = useTable(tables.wiki),
      wiki = wikis.find((w: Wiki) => w.id === wikiId && w.orgId === Number(org._id)),
      removeWiki = useMut(reducers.rmWiki, {
        onSuccess: () => router.push('/wiki'),
        toast: { success: 'Wiki page deleted' }
      }),
      form = useFormMutation({
        mutate: useReducer(reducers.updateWiki),
        resetOnSuccess: false,
        schema: wikiSchema,
        toast: { success: 'Wiki page saved' },
        transform: d => ({
          ...d,
          deletedAt: wiki?.deletedAt,
          editors: wiki?.editors,
          expectedUpdatedAt: wiki?.updatedAt,
          id: wikiId
        }),
        values: wiki ? pickValues(wikiSchema, wiki) : undefined
      })

    if (!wiki) return <Skeleton className='h-40' />

    return (
      <Form
        className='space-y-4'
        form={form}
        render={({ Choose, Text }) => (
          <>
            <FieldGroup>
              <Text helpText='Page heading shown in wiki lists.' name='title' placeholder='Page title' required />
              <Text helpText='URL-safe slug used in links.' name='slug' placeholder='my-wiki-page' required />
              <Text helpText='Optional draft content.' multiline name='content' />
              <Choose helpText='Publish when content is ready.' name='status' required />
            </FieldGroup>
            <div className='flex items-center gap-2'>
              <AutoSaveIndicator data-testid='auto-save-indicator' lastSaved={form.lastSaved} />
              <span className='flex-1' />
              <Button
                onClick={() => {
                  removeWiki({ id: wikiId })
                }}
                type='button'
                variant='destructive'>
                Delete
              </Button>
            </div>
          </>
        )}
      />
    )
  },
  EditWikiPage = ({ params }: { params: Promise<{ wikiId: string }> }) => {
    const { wikiId } = use(params),
      id = Number(wikiId),
      { isAdmin, org } = useOrg(),
      { identity } = useSpacetimeDB(),
      [wikis] = useTable(tables.wiki),
      wiki = wikis.find((w: Wiki) => w.id === id && w.orgId === Number(org._id))

    if (!(wiki && identity)) return <Skeleton className='h-40' />

    const editorsList = (wiki.editors ?? []).map(e => ({ userId: e.toHexString() })),
      canEditWiki =
        isAdmin || sameIdentity(wiki.userId, identity) || editorsList.some(e => e.userId === identity.toHexString())

    return (
      <PermissionGuard backHref={`/wiki/${wikiId}`} backLabel='wiki page' canAccess={canEditWiki} resource='wiki page'>
        <div className='flex justify-center'>
          <Card className='w-full max-w-md'>
            <CardHeader>
              <CardTitle>Edit wiki page</CardTitle>
            </CardHeader>
            <CardContent>
              <EditWikiForm wikiId={id} />
            </CardContent>
          </Card>
        </div>
      </PermissionGuard>
    )
  }

export default EditWikiPage
