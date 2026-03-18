'use client'

import type { ComponentProps } from 'react'

import { cn } from '@a/ui'
import { Button } from '@a/ui/button'

interface LoadMoreButtonProps extends Omit<ComponentProps<typeof Button>, 'children' | 'onClick'> {
  label?: string
  onLoadMore: () => void
}

const LoadMoreButton = ({ className, label = 'Load more', onLoadMore, ...props }: LoadMoreButtonProps) => (
  <Button
    {...props}
    className={cn('mx-auto mt-4 block text-sm text-muted-foreground hover:text-foreground', className)}
    onClick={() => onLoadMore()}
    size='sm'
    variant='ghost'>
    {label}
  </Button>
)

export default LoadMoreButton
