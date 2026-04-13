'use client'
import type { ErrorToastOptions, ToastFn } from '@a/shared/react/error-toast'
import { createErrorToastHooks } from '@a/shared/react/error-toast'
import type { ErrorData } from '../server/helpers'
import { extractErrorData, getErrorMessage, handleError } from '../server/helpers'
const { makeErrorHandler, toastFieldError, useErrorToast } = createErrorToastHooks<ErrorData>({
  extractErrorData,
  getErrorMessage,
  handleError: handleError as (error: unknown, handlers: Record<string, unknown>) => void
})
export type { ErrorToastOptions, ToastFn }
export { makeErrorHandler, toastFieldError, useErrorToast }
