/** biome-ignore-all lint/suspicious/useAwait: promise-function-async conflict */
/** biome-ignore-all lint/style/useReactFunctionComponents: ErrorBoundary requires class component */
/* eslint-disable @typescript-eslint/explicit-member-accessibility, react/require-optimization, react/no-set-state, react/sort-comp */
'use client'

import type { ErrorInfo, ReactNode } from 'react'

import { Component } from 'react'

import { extractErrorData, getErrorMessage } from '../server/helpers'

interface ConvexErrorBoundaryProps {
  children: ReactNode
  fallback?: (props: { error: Error; resetErrorBoundary: () => void }) => ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ConvexErrorBoundaryState {
  error: Error | null
}

class ConvexErrorBoundary extends Component<ConvexErrorBoundaryProps, ConvexErrorBoundaryState> {
  constructor(props: ConvexErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): ConvexErrorBoundaryState {
    return { error }
  }

  // oxlint-disable-next-line class-methods-use-this

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError } = this.props
    if (onError) onError(error, errorInfo)
  }

  async render() {
    const { error } = this.state,
      { children, fallback } = this.props

    if (!error) return children

    if (fallback) return fallback({ error, resetErrorBoundary: () => this.setState({ error: null }) })

    const data = extractErrorData(error),
      code = data?.code,
      message = getErrorMessage(error)

    return (
      <div className='flex min-h-[200px] items-center justify-center p-6'>
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

/** Exports ConvexErrorBoundary component. */
export default ConvexErrorBoundary
