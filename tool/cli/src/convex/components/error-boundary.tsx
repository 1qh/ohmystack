/** biome-ignore-all lint/suspicious/useAwait: promise-function-async conflict */
/** biome-ignore-all lint/style/useReactFunctionComponents: ErrorBoundary requires class component */
'use client'
import { createErrorBoundary } from '../../shared/components/error-boundary'
import { extractErrorData, getErrorMessage } from '../server/helpers'
const ErrorBoundary = createErrorBoundary({
  readErrorCode: error => extractErrorData(error)?.code,
  readErrorMessage: error => getErrorMessage(error)
})
export default ErrorBoundary
