'use client'
import type { ErrorToastOptions, ToastFn } from '@a/shared/react/error-toast'
import { createErrorToastHooks } from '@a/shared/react/error-toast'
import type { ErrorData, ErrorHandler } from '../server/helpers'
import { extractErrorData, getErrorMessage, handleError } from '../server/helpers'
const { makeErrorHandler, toastFieldError, useErrorToast } = createErrorToastHooks<ErrorData>({
  extractErrorData,
  getErrorMessage,
  handleError
})
export type { ErrorHandler, ErrorToastOptions, ToastFn }
export { makeErrorHandler, toastFieldError, useErrorToast }
