'use client'

import { Button } from '@a/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@a/ui/card'
import { Building2, Plus } from 'lucide-react'
import Link from 'next/link'

const NoOrgPrompt = () => (
  <Card className='mx-auto max-w-md'>
    <CardHeader className='text-center'>
      <Building2 className='mx-auto size-12 text-muted-foreground' />
      <CardTitle>No organization</CardTitle>
      <CardDescription>Create or join an organization to get started.</CardDescription>
    </CardHeader>
    <CardContent className='flex justify-center gap-4'>
      <Button asChild>
        <Link href='/new'>
          <Plus className='mr-2 size-4' />
          Create organization
        </Link>
      </Button>
    </CardContent>
  </Card>
)

export default NoOrgPrompt
