// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'

import { reducers } from '@a/be-spacetimedb/spacetimedb'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@a/ui/card'
import { useMut } from '@noboil/spacetimedb/react'
import { CheckCircle, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { use, useState } from 'react'

const AcceptInvitePage = ({ params }: { params: Promise<{ token: string }> }) => {
  const { token } = use(params),
    router = useRouter(),
    [accepted, setAccepted] = useState(false),
    [inviteError, setInviteError] = useState<null | string>(null),
    acceptInvite = useMut(reducers.orgAcceptInvite, {
      onSettled: (_args, error) => {
        if (!error) return
        setInviteError(error instanceof Error ? error.message : 'Invalid or expired invite')
      },
      onSuccess: () => {
        setAccepted(true)
        setTimeout(() => router.push('/'), 1500)
      },
      toast: { success: 'Welcome to the organization!' }
    })

  if (accepted)
    return (
      <div className='container flex justify-center py-16'>
        <Card className='w-full max-w-md text-center'>
          <CardContent className='py-8'>
            <CheckCircle className='mx-auto mb-4 size-16 text-green-500' />
            <h2 className='text-xl font-bold'>You&apos;re in!</h2>
            <p className='text-muted-foreground'>Redirecting to organization...</p>
          </CardContent>
        </Card>
      </div>
    )

  if (inviteError)
    return (
      <div className='container flex justify-center py-16'>
        <Card className='w-full max-w-md text-center'>
          <CardContent className='py-8'>
            <XCircle className='mx-auto mb-4 size-16 text-destructive' />
            <h2 className='text-xl font-bold'>Invite failed</h2>
            <p className='text-muted-foreground'>{inviteError}</p>
          </CardContent>
        </Card>
      </div>
    )

  return (
    <div className='container flex justify-center py-16'>
      <Card className='w-full max-w-md'>
        <CardHeader className='text-center'>
          <CardTitle>Join organization</CardTitle>
          <CardDescription>You&apos;ve been invited to join an organization.</CardDescription>
        </CardHeader>
        <CardContent className='flex justify-center'>
          <Button
            onClick={() => {
              acceptInvite({ token })
            }}
            size='lg'>
            Accept invite
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default AcceptInvitePage
