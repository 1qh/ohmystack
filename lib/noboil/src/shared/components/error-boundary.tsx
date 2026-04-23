/* eslint-disable react/require-optimization, react/sort-comp */
/** biome-ignore-all lint/nursery/noComponentHookFactories: factory returns hook by design */
/** biome-ignore-all lint/suspicious/useAwait: render-only class method */
/** biome-ignore-all lint/style/useConsistentMemberAccessibility: class methods */
/** biome-ignore-all lint/style/useReactFunctionComponents: ErrorBoundary requires class component */
/* eslint-disable react/no-set-state */
'use client'
import type { ErrorInfo, ReactNode } from 'react'
import { cn } from '@a/ui'
import { Component } from 'react'
interface CreateErrorBoundaryOptions {
  readErrorCode: (error: Error) => string | undefined
  readErrorMessage: (error: Error) => string
}
interface ErrorBoundaryProps {
  children: ReactNode
  className?: string
  fallback?: (props: { error: Error; resetErrorBoundary: () => void }) => ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}
interface ErrorBoundaryState {
  error: Error | null
}
const createErrorBoundary = ({ readErrorCode, readErrorMessage }: CreateErrorBoundaryOptions) => {
  class SharedErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public constructor(props: ErrorBoundaryProps) {
      super(props)
      this.state = { error: null }
    }
    public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
      return { error }
    }
    public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
      const { onError } = this.props
      if (onError) onError(error, errorInfo)
    }
    public override async render() {
      const { error } = this.state
      const { children, className, fallback } = this.props
      if (!error) return children
      if (fallback) return fallback({ error, resetErrorBoundary: () => this.setState({ error: null }) })
      const code = readErrorCode(error)
      const message = readErrorMessage(error)
      return (
        <div className={cn('flex min-h-[200px] items-center justify-center p-6', className)}>
          <div className='max-w-md space-y-3 text-center'>
            {code ? (
              <span className='rounded-sm bg-destructive/10 px-2 py-1 font-mono text-xs text-destructive'>{code}</span>
            ) : null}
            <h2 className='text-lg font-semibold text-foreground dark:text-foreground'>Something went wrong</h2>
            <p className='text-sm text-muted-foreground dark:text-muted-foreground'>{message}</p>
            <button
              className='rounded-md bg-background px-4 py-2 text-sm text-foreground hover:bg-muted dark:bg-background dark:text-foreground dark:hover:bg-muted'
              onClick={() => this.setState({ error: null })}
              type='button'>
              Try again
            </button>
          </div>
        </div>
      )
    }
  }
  return SharedErrorBoundary
}
export { createErrorBoundary }
export type { ErrorBoundaryProps, ErrorBoundaryState }
