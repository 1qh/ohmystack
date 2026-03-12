'use client'

import { Button } from '@a/ui/button'
import Link from 'next/link'

interface OAuthLoginShellProps {
  emailLoginPath: string
  emailLoginText: string
  onGoogleClick: () => void
}

const OAuthLoginShell = ({ emailLoginPath, emailLoginText, onGoogleClick }: OAuthLoginShellProps) => (
  <div className='m-auto space-y-2'>
    <Button
      className='group rounded-full pr-5! tracking-tight transition-all duration-300 hover:scale-105 hover:gap-1 hover:pl-2 active:scale-90'
      onClick={onGoogleClick}>
      Continue with Google
    </Button>
    <Link
      className='block text-center text-sm font-light text-muted-foreground transition-all duration-300 hover:font-normal hover:text-foreground'
      href={emailLoginPath}>
      {emailLoginText}
    </Link>
  </div>
)

export default OAuthLoginShell
