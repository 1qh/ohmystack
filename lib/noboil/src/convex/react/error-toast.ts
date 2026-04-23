'use client'
import type { ErrorToastOptions, ToastFn } from '../../shared/react/error-toast'
import type { ErrorData, ErrorHandler } from '../server/helpers'
import { createErrorToastHooks } from '../../shared/react/error-toast'
import { extractErrorData, getErrorMessage, handleError } from '../server/helpers'
const { makeErrorHandler, toastFieldError, useErrorToast } = createErrorToastHooks<ErrorData>({
  extractErrorData,
  getErrorMessage,
  handleError: handleError as (error: unknown, handlers: Record<string, unknown>) => void
})
export type { ErrorHandler, ErrorToastOptions, ToastFn }
export { makeErrorHandler, toastFieldError, useErrorToast }
