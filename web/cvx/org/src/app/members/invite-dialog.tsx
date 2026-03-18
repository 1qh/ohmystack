'use client'

import type { Id } from '@a/be-convex/model'

import { api } from '@a/be-convex'
import { Button } from '@a/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@a/ui/dialog'
import { Form, useForm } from '@noboil/convex/components'
import { useMutation } from 'convex/react'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { invite } from '~/schema'

interface InviteDialogProps {
  orgId: Id<'org'>
}

const InviteDialog = ({ orgId }: InviteDialogProps) => {
  const [open, setOpen] = useState(false),
    sendInvite = useMutation(api.org.invite),
    form = useForm({
      onSubmit: async d => {
        const result = await sendInvite({ ...d, orgId })
        if (!('token' in result)) return d
        await navigator.clipboard.writeText(`${globalThis.location.origin}/invite/${result.token}`)
        toast.success('Invite link copied to clipboard')
        setOpen(false)
        return d
      },
      resetOnSuccess: true,
      schema: invite
    })

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button>
          <Plus className='mr-2 size-4' />
          Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>Send an invite link to add someone to your organization.</DialogDescription>
        </DialogHeader>
        <Form
          className='space-y-4'
          form={form}
          render={({ Submit, Text, Toggle }) => (
            <>
              <Text name='email' placeholder='email@example.com' type='email' />
              <Toggle name='isAdmin' trueLabel='Invite as admin' />
              <Submit className='w-full'>Create invite link</Submit>
            </>
          )}
        />
      </DialogContent>
    </Dialog>
  )
}

export default InviteDialog
