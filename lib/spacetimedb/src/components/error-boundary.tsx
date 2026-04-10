/** biome-ignore-all lint/style/useReactFunctionComponents: ErrorBoundary requires class component */
// biome-ignore-all lint/suspicious/useAwait: async without await
'use client'
import { createErrorBoundary } from '@a/shared/components/error-boundary'
import { extractErrorData, getErrorMessage } from '../server/helpers'
const ErrorBoundary = createErrorBoundary({
  readErrorCode: error => extractErrorData(error)?.code,
  readErrorMessage: error => getErrorMessage(error)
})
export default ErrorBoundary
