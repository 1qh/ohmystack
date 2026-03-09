'use client'
import { useCallback } from 'react'

import type { ConvexErrorData, ErrorHandler } from '../server/helpers'

import { extractErrorData, getErrorMessage, handleConvexError } from '../server/helpers'

/** Configuration for the error toast hook. */
interface ErrorToastOptions {
  handlers?: ErrorHandler
  toast: ToastFn
}

/** A function that displays a toast notification with the given message. */
type ToastFn = (message: string) => void

/** Hook that returns an error handler callback which routes errors to custom handlers or a toast. */
const useErrorToast = ({ handlers, toast }: ErrorToastOptions) =>
    useCallback(
      (error: unknown) => {
        const data = extractErrorData(error),
          code = data?.code,
          hasSpecificHandler = code ? Object.hasOwn(handlers ?? {}, code) : false
        if (hasSpecificHandler) {
          handleConvexError(error, handlers ?? {})
          return
        }
        const message = data?.message ?? getErrorMessage(error)
        toast(message)
      },
      [handlers, toast]
    ),
  /** Creates a standalone error handler that routes known error codes to overrides, falling back to toast. */
  makeErrorHandler = (toast: ToastFn, overrides?: Partial<Record<string, (data?: ConvexErrorData) => void>>) => {
    const handler: ErrorHandler = {
      ...overrides,
      default: () => {
        /* Noop */
      }
    }
    return (error: unknown) => {
      const data = extractErrorData(error),
        code = data?.code,
        hasOverride = code ? Object.hasOwn(overrides ?? {}, code) : false
      if (hasOverride) {
        handleConvexError(error, handler)
        return
      }
      toast(data?.message ?? getErrorMessage(error))
    }
  }

export type { ErrorToastOptions, ToastFn }
export { makeErrorHandler, useErrorToast }
