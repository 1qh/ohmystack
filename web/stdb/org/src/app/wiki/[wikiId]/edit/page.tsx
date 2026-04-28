/* eslint-disable @typescript-eslint/strict-void-return */
/* oxlint-disable unicorn/no-useless-promise-resolve-reject, promise/prefer-await-to-then, promise/always-return, promise/catch-or-return */
/** biome-ignore-all lint/suspicious/useAwait: sync reducers wrapped as promises */
/* oxlint-disable eslint-plugin-react(forbid-component-props), eslint(no-underscore-dangle) */
// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'
import type { Wiki } from '@a/be-spacetimedb/spacetimedb/types'
import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { sameIdentity } from '@a/fe/utils'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { Skeleton } from '@a/ui/skeleton'
import { useRouter } from 'next/navigation'
import { AutoSaveIndicator, Form, PermissionGuard, useFormMutation } from 'noboil/spacetimedb/components'
import { useSoftDelete } from 'noboil/spacetimedb/react'
import { pickValues } from 'noboil/spacetimedb/zod'
import { use } from 'react'
import { toast } from 'sonner'
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'
import { useOrg } from '~/hook/use-org'
import { wiki as wikiSchema } from '~/schema'
const EditWikiForm = ({ wiki, wikis }: { wiki: Wiki; wikis: readonly Wiki[] }) => {
  const router = useRouter()
  const updateWikiReducer = useReducer(reducers.updateWiki)
  const rmWikiReducer = useReducer(reducers.rmWiki)
  const { remove } = useSoftDelete({
    label: 'wiki page',
    restore: async (restoreArgs: { id: string }) => {
      const target = wikis.find(w => w.id === Number(restoreArgs.id))
      if (target)
        updateWikiReducer({
          content: target.content,
          editors: undefined,
          expectedUpdatedAt: undefined,
          id: target.id,
          slug: target.slug,
          status: target.status,
          title: target.title
        })
      return Promise.resolve()
    },
    rm: async (rmArgs: { id: string }) => {
      rmWikiReducer({ id: Number(rmArgs.id) })
      return Promise.resolve()
    },
    toast
  })
  const form = useFormMutation({
    mutate: useReducer(reducers.updateWiki),
    resetOnSuccess: false,
    schema: wikiSchema,
    toast: { success: 'Wiki page saved' },
    transform: d => ({
      ...d,
      deletedAt: wiki.deletedAt,
      editors: wiki.editors,
      expectedUpdatedAt: wiki.updatedAt,
      id: wiki.id
    }),
    values: pickValues(wikiSchema, wiki)
  })
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
                remove({ id: String(wiki.id) }).then(() => router.push('/wiki'))
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
}
const EditWikiPage = ({ params }: { params: Promise<{ wikiId: string }> }) => {
  const { wikiId } = use(params)
  const id = Number(wikiId)
  const { isAdmin, org } = useOrg()
  const { identity } = useSpacetimeDB()
  const [wikis] = useTable(tables.wiki)
  const wiki = wikis.find((w: Wiki) => w.id === id && w.orgId === Number(org._id))
  if (!(wiki && identity)) return <Skeleton className='h-40' />
  const editorsList = (wiki.editors ?? []).map(e => ({ userId: e.toHexString() }))
  const canEditWiki =
    isAdmin || sameIdentity(wiki.userId, identity) || editorsList.some(e => e.userId === identity.toHexString())
  return (
    <PermissionGuard backHref={`/wiki/${wikiId}`} backLabel='wiki page' canAccess={canEditWiki} resource='wiki page'>
      <div className='flex justify-center'>
        <Card className='w-full max-w-md'>
          <CardHeader>
            <CardTitle>Edit wiki page</CardTitle>
          </CardHeader>
          <CardContent>
            <EditWikiForm wiki={wiki} wikis={wikis} />
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  )
}
export default EditWikiPage
