/* oxlint-disable promise/prefer-await-to-then */
'use client'
import { api } from '@a/be-convex'
import { fail } from '@a/fe/utils'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@a/ui/card'
import { Skeleton } from '@a/ui/skeleton'
import { Form, OrgAvatar, useForm } from '@noboil/convex/components'
import { setActiveOrgCookieClient } from '@noboil/convex/react'
import { useMutation, useQuery } from 'convex/react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { toast } from 'sonner'

import { joinRequest } from '~/schema'
const JoinPage = ({ params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = use(params),
    router = useRouter(),
    org = useQuery(api.org.getPublic, { slug }),
    myRequest = useQuery(api.org.myJoinRequest, org ? { orgId: org._id } : 'skip'),
    membership = useQuery(api.org.membership, org ? { orgId: org._id } : 'skip'),
    cancelRequest = useMutation(api.org.cancelJoinRequest),
    requestJoin = useMutation(api.org.requestJoin),
    form = useForm({
      onSubmit: async d => {
        if (!org) return d
        await requestJoin({ message: d.message ?? undefined, orgId: org._id })
        toast.success('Join request sent')
        return d
      },
      resetOnSuccess: true,
      schema: joinRequest
    }),
    handleCancel = async () => {
      if (!myRequest) return
      try {
        await cancelRequest({ requestId: myRequest._id })
        toast.success('Request cancelled')
      } catch (error) {
        fail(error)
      }
    }
  if (org === undefined) return <Skeleton className='mx-auto h-64 max-w-md' />
  if (org === null) return <div className='text-center text-muted-foreground'>Organization not found</div>
  if (membership && !('code' in membership)) {
    setActiveOrgCookieClient({ orgId: org._id, slug })
    router.push('/dashboard')
    return null
  }
  return (
    <div className='mx-auto max-w-md py-12'>
      <Card>
        <CardHeader className='items-center text-center'>
          <OrgAvatar name={org.name} size='lg' src={org.avatarId ? `/api/image?id=${org.avatarId}` : undefined} />
          <CardTitle className='mt-4'>{org.name}</CardTitle>
          <CardDescription>Request to join this organization</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {myRequest ? (
            <div className='space-y-4 text-center'>
              <p className='text-muted-foreground'>Your request is pending approval.</p>
              <Button
                onClick={() => {
                  handleCancel().catch(() => undefined)
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
                  <Text multiline name='message' placeholder='Optional message to the admins...' rows={3} />
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
