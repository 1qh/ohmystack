/** biome-ignore-all lint/suspicious/useAwait: promise-function-async conflict */
/** biome-ignore-all lint/style/useReactFunctionComponents: ErrorBoundary requires class component */
/* eslint-disable react/require-optimization, react/no-set-state, react/sort-comp */
'use client'
import { createErrorBoundary } from '@a/shared/components/error-boundary'
import { extractErrorData, getErrorMessage } from '../server/helpers'

const ConvexErrorBoundary = createErrorBoundary({
  displayName: 'ConvexErrorBoundary',
  readErrorCode: error => extractErrorData(error)?.code,
  readErrorMessage: error => getErrorMessage(error)
})

export default ConvexErrorBoundary
