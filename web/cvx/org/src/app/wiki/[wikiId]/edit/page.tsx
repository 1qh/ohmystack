/* oxlint-disable promise/prefer-await-to-then, promise/always-return, promise/catch-or-return */
'use client'

import type { Id } from '@a/be-convex/model'

import { api } from '@a/be-convex'
import { orgScoped } from '@a/be-convex/t'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { Skeleton } from '@a/ui/skeleton'
import { AutoSaveIndicator, Form, PermissionGuard, useFormMutation } from '@noboil/convex/components'
import { canEditResource, useOrgMutation, useOrgQuery, useSoftDelete } from '@noboil/convex/react'
import { pickValues } from '@noboil/convex/zod'
import { useQuery } from 'convex/react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { toast } from 'sonner'

import { useOrg } from '~/hook/use-org'

const wikiRestore = (api.wiki as typeof api.wiki & { restore: typeof api.wiki.rm }).restore,
  EditWikiForm = ({ wikiId }: { wikiId: Id<'wiki'> }) => {
    const router = useRouter(),
      { org } = useOrg(),
      wiki = useOrgQuery(api.wiki.read, { id: wikiId }),
      { remove } = useSoftDelete({
        label: 'wiki page',
        restore: useOrgMutation(wikiRestore),
        rm: useOrgMutation(api.wiki.rm),
        // eslint-disable-next-line @typescript-eslint/strict-void-return
        toast
      }),
      form = useFormMutation({
        autoSave: { debounceMs: 2000, enabled: true },
        mutation: api.wiki.update,
        schema: orgScoped.wiki,
        transform: d => ({ ...d, expectedUpdatedAt: wiki?.updatedAt, id: wikiId, orgId: org._id }),
        values: wiki ? pickValues(orgScoped.wiki, wiki) : undefined
      }),
      handleDelete = () => {
        remove({ id: wikiId }).then(() => router.push('/wiki'))
      }

    if (!wiki) return <Skeleton className='h-40' />

    return (
      <Form
        className='space-y-4'
        form={form}
        render={({ Choose, Text }) => (
          <>
            <FieldGroup>
              <Text name='title' placeholder='Page title' />
              <Text name='slug' placeholder='my-wiki-page' />
              <Text multiline name='content' />
              <Choose name='status' />
            </FieldGroup>
            <div className='flex items-center gap-2'>
              <AutoSaveIndicator data-testid='auto-save-indicator' lastSaved={form.lastSaved} />
              <span className='flex-1' />
              <Button onClick={handleDelete} type='button' variant='destructive'>
                Delete
              </Button>
            </div>
          </>
        )}
      />
    )
  },
  EditWikiPage = ({ params }: { params: Promise<{ wikiId: Id<'wiki'> }> }) => {
    const { wikiId } = use(params),
      { isAdmin } = useOrg(),
      me = useQuery(api.user.me, {}),
      wiki = useOrgQuery(api.wiki.read, { id: wikiId }),
      editorsList = useOrgQuery(api.wiki.editors, { wikiId })

    if (!(wiki && me && editorsList)) return <Skeleton className='h-40' />

    const canEditWiki = canEditResource({ editorsList, isAdmin, resource: wiki, userId: me._id })

    return (
      <PermissionGuard backHref={`/wiki/${wikiId}`} backLabel='wiki page' canAccess={canEditWiki} resource='wiki page'>
        <div className='flex justify-center'>
          <Card className='w-full max-w-md'>
            <CardHeader>
              <CardTitle>Edit wiki page</CardTitle>
            </CardHeader>
            <CardContent>
              <EditWikiForm wikiId={wikiId} />
            </CardContent>
          </Card>
        </div>
      </PermissionGuard>
    )
  }

export default EditWikiPage
