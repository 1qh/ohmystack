/* eslint-disable @typescript-eslint/strict-void-return */
/* oxlint-disable promise/prefer-await-to-then, promise/always-return, promise/catch-or-return */
'use client'
import type { Id } from '@a/be-convex/model'
import { api } from '@a/be-convex'
import { orgScoped } from '@a/be-convex/s'
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
const wikiRestore = (api.wiki as typeof api.wiki & { restore: typeof api.wiki.rm }).restore
const EditWikiForm = ({ wikiId }: { wikiId: Id<'wiki'> }) => {
  const router = useRouter()
  const { org } = useOrg()
  const wiki = useOrgQuery(api.wiki.read, { id: wikiId })
  const { remove } = useSoftDelete({
    label: 'wiki page',
    restore: useOrgMutation(wikiRestore),
    rm: useOrgMutation(api.wiki.rm),
    toast
  })
  const form = useFormMutation({
    autoSave: { debounceMs: 2000, enabled: true },
    doc: wiki,
    mutation: api.wiki.update,
    schema: orgScoped.wiki,
    transform: d => ({ ...d, id: wikiId, orgId: org._id }),
    values: wiki ? pickValues(orgScoped.wiki, wiki) : undefined
  })
  const handleDelete = async () => {
    await remove({ id: wikiId })
    router.push('/wiki')
  }
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
              className='!text-destructive-foreground border-destructive! bg-destructive! hover:bg-destructive/90! focus-visible:border-destructive! focus-visible:ring-destructive! dark:bg-destructive! dark:hover:bg-destructive/90!'
              onClick={handleDelete}
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
const EditWikiPage = ({ params }: { params: Promise<{ wikiId: Id<'wiki'> }> }) => {
  const { wikiId } = use(params)
  const { isAdmin } = useOrg()
  const me = useQuery(api.user.me, {})
  const wiki = useOrgQuery(api.wiki.read, { id: wikiId })
  const editorsList = useOrgQuery(api.wiki.editors, { wikiId })
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
