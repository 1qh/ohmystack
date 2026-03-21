/** biome-ignore-all lint/style/useReactFunctionComponents: ErrorBoundary requires class component */
// biome-ignore-all lint/suspicious/useAwait: async without await
/* eslint-disable react/require-optimization, react/no-set-state, react/sort-comp */
'use client'
import type { ErrorInfo, ReactNode } from 'react'
import { cn } from '@a/ui'
import { Component } from 'react'
interface ErrorBoundaryProps {
  children: ReactNode
  className?: string
  fallback?: (props: { error: Error; resetErrorBoundary: () => void }) => ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}
interface ErrorBoundaryState {
  error: Error | null
}
const asRecord = (value: unknown): null | Record<string, unknown> => {
    if (typeof value === 'object' && value !== null) return value as Record<string, unknown>
    return null
  },
  readErrorCode = (error: Error): string | undefined => {
    const errorRecord = asRecord(error)
    if (!errorRecord) return
    const directCode = errorRecord.code
    if (typeof directCode === 'string' && directCode.length > 0) return directCode
    const dataRecord = asRecord(errorRecord.data)
    if (!dataRecord) return
    const nestedCode = dataRecord.code
    if (typeof nestedCode === 'string' && nestedCode.length > 0) return nestedCode
  },
  readErrorMessage = (error: Error): string => {
    const message = error.message.trim()
    if (message.length > 0) return message
    return 'Unknown error'
  }
/** React error boundary that catches render errors and shows a fallback UI. */
class BetterspaceErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }
  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError } = this.props
    if (onError) onError(error, errorInfo)
  }
  override async render() {
    const { error } = this.state,
      { children, className, fallback } = this.props
    if (!error) return children
    if (fallback) return fallback({ error, resetErrorBoundary: () => this.setState({ error: null }) })
    const code = readErrorCode(error),
      message = readErrorMessage(error)
    return (
      <div className={cn('flex min-h-[200px] items-center justify-center p-6', className)}>
        <div className='max-w-md space-y-3 text-center'>
          {code ? <span className='rounded-sm bg-red-100 px-2 py-1 font-mono text-xs text-red-700'>{code}</span> : null}
          <h2 className='text-lg font-semibold text-zinc-900 dark:text-zinc-100'>Something went wrong</h2>
          <p className='text-sm text-zinc-600 dark:text-zinc-400'>{message}</p>
          <button
            className='rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300'
            onClick={() => this.setState({ error: null })}
            type='button'>
            Try again
          </button>
        </div>
      </div>
    )
  }
}
export default BetterspaceErrorBoundary
