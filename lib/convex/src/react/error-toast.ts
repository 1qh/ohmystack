'use client'
import type { ErrorToastOptions, ToastFn } from '@a/shared/react/error-toast'
import { createErrorToastHooks } from '@a/shared/react/error-toast'
import type { ConvexErrorData, ErrorHandler } from '../server/helpers'
import { extractErrorData, getErrorMessage, handleConvexError } from '../server/helpers'
const { makeErrorHandler, toastFieldError, useErrorToast } = createErrorToastHooks<ConvexErrorData>({
  extractErrorData,
  getErrorMessage,
  handleError: handleConvexError
})
export type { ErrorHandler, ErrorToastOptions, ToastFn }
export { makeErrorHandler, toastFieldError, useErrorToast }
