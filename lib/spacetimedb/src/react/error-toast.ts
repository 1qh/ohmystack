'use client'
import type { ErrorToastOptions, ToastFn } from '@a/shared/react/error-toast'
import { createErrorToastHooks } from '@a/shared/react/error-toast'
import type { ErrorData } from '../server/helpers'
import { extractErrorData, getErrorMessage, getFirstFieldError, handleError } from '../server/helpers'
const { makeErrorHandler, useErrorToast } = createErrorToastHooks<ErrorData>({
    extractErrorData,
    getErrorMessage,
    handleError
  }),
  toastFieldError = (error: unknown, toastFn: ToastFn): boolean => {
    const msg = getFirstFieldError(error)
    if (msg) {
      toastFn(msg)
      return true
    }
    return false
  }
export type { ErrorToastOptions, ToastFn }
export { makeErrorHandler, toastFieldError, useErrorToast }
