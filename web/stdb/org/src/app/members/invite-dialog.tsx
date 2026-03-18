'use client'

import { reducers } from '@a/be-spacetimedb/spacetimedb'
import { Button } from '@a/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@a/ui/dialog'
import { Form, useFormMutation } from '@noboil/spacetimedb/components'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useReducer } from 'spacetimedb/react'

import { invite } from '~/schema'

interface InviteDialogProps {
  orgId: string
}

const InviteDialog = ({ orgId }: InviteDialogProps) => {
  const [open, setOpen] = useState(false),
    form = useFormMutation({
      mutate: useReducer(reducers.orgSendInvite),
      onSuccess: () => setOpen(false),
      schema: invite,
      toast: { success: 'Invite sent' },
      transform: d => ({ ...d, orgId: Number(orgId) })
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
              <Text
                helpText='A valid email address is required.'
                name='email'
                placeholder='email@example.com'
                required
                type='email'
              />
              <Toggle helpText='Enable to grant admin permissions.' name='isAdmin' trueLabel='Invite as admin' />
              <Submit className='w-full'>Create invite link</Submit>
            </>
          )}
        />
      </DialogContent>
    </Dialog>
  )
}

export default InviteDialog
