// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@a/ui/card'
import { Skeleton } from '@a/ui/skeleton'
import { Form, OrgAvatar, useForm } from '@noboil/spacetimedb/components'
import { resolveFileUrl, setActiveOrgCookieClient, useFiles, useMut } from '@noboil/spacetimedb/react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'
import { joinRequest } from '~/schema'
const JoinPage = ({ params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = use(params)
  const router = useRouter()
  const { identity } = useSpacetimeDB()
  const [orgs] = useTable(tables.org)
  const files = useFiles()
  const [requests] = useTable(tables.orgJoinRequest)
  const [members] = useTable(tables.orgMember)
  const org = orgs.find(o => o.slug === slug)
  const myRequest =
    identity && org
      ? requests.find(
          r => r.orgId === org.id && r.userId.toHexString() === identity.toHexString() && r.status === 'pending'
        )
      : null
  const membership =
    identity && org ? members.find(m => m.orgId === org.id && m.userId.toHexString() === identity.toHexString()) : null
  const cancelRequest = useMut(reducers.orgCancelJoin, {
    toast: { error: 'Failed to cancel request', success: 'Request cancelled' }
  })
  const requestJoin = useMut(reducers.orgRequestJoin, {
    toast: { error: 'Join request failed', success: 'Join request sent' }
  })
  const form = useForm({
    onSubmit: async d => {
      if (!org) return d
      await requestJoin({ message: d.message, orgId: org.id })
      return d
    },
    resetOnSuccess: true,
    schema: joinRequest
  })
  if (!orgs) return <Skeleton className='mx-auto h-64 max-w-md' />
  if (!org) return <div className='text-center text-muted-foreground'>Organization not found</div>
  if (membership) {
    setActiveOrgCookieClient({ orgId: `${org.id}`, slug })
    router.push('/dashboard')
    return null
  }
  return (
    <div className='mx-auto max-w-md py-12'>
      <Card>
        <CardHeader className='items-center text-center'>
          <OrgAvatar
            name={org.name}
            size='lg'
            src={org.avatarId ? (resolveFileUrl(files, org.avatarId) ?? undefined) : undefined}
          />
          <CardTitle className='mt-4'>{org.name}</CardTitle>
          <CardDescription>Request to join this organization</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {myRequest ? (
            <div className='space-y-4 text-center'>
              <p className='text-muted-foreground'>Your request is pending approval.</p>
              <Button
                onClick={() => {
                  cancelRequest({ requestId: myRequest.id })
                }}
                variant='outline'>
                Cancel request
              </Button>
            </div>
          ) : (
            <Form
              className='space-y-4'
              form={form}
              render={({ Submit, Text }) => (
                <>
                  <Text
                    helpText='Optional note for organization admins.'
                    multiline
                    name='message'
                    placeholder='Optional message to the admins...'
                    rows={3}
                  />
                  <Submit className='w-full'>Request to Join</Submit>
                </>
              )}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
export default JoinPage
