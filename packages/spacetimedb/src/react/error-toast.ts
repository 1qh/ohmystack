'use client'

import { useCallback } from 'react'

import { extractErrorData, getErrorMessage, getFirstFieldError, handleError } from '../server/helpers'
import { noop } from './list-utils'

type ErrorCode = ErrorData['code']
type ErrorData = NonNullable<ReturnType<typeof extractErrorData>>
type ErrorHandlers = Partial<Record<ErrorCode, (data: ErrorData) => void>> & {
  default?: (error: unknown) => void
}

interface ErrorToastOptions {
  handlers?: ErrorHandlers
  toast: ToastFn
}

type ToastFn = (message: string) => void

/**
 * Creates a stable callback that toasts Betterspace errors.
 * @param options Toast function plus optional code-specific handlers.
 * @returns Memoized error handler for use in React callbacks.
 */
const useErrorToast = ({ handlers, toast }: ErrorToastOptions) =>
    useCallback(
      (error: unknown) => {
        const data = extractErrorData(error),
          code = data?.code,
          hasSpecificHandler = code ? Object.hasOwn(handlers ?? {}, code) : false
        if (hasSpecificHandler) {
          handleError(error, handlers ?? {})
          return
        }
        toast(data?.message ?? getErrorMessage(error))
      },
      [handlers, toast]
    ),
  /**
   * Builds an imperative error handler with optional code overrides.
   * @param toast Toast function used for fallback messages.
   * @param overrides Optional per-code override handlers.
   * @returns Error handler that routes Betterspace errors by code.
   */
  makeErrorHandler = (toast: ToastFn, overrides?: Partial<Record<ErrorCode, (data: ErrorData) => void>>) => {
    const handler: ErrorHandlers = {
      ...overrides,
      default: noop
    }

    return (error: unknown) => {
      const data = extractErrorData(error),
        code = data?.code,
        hasOverride = code ? Object.hasOwn(overrides ?? {}, code) : false
      if (hasOverride) {
        handleError(error, handler)
        return
      }
      toast(data?.message ?? getErrorMessage(error))
    }
  },
  /** Toasts the first field validation error from a Betterspace error.
   * @param error - Unknown error value
   * @param toastFn - Toast function to call with the error message
   * @returns `true` if a field error was toasted, `false` otherwise
   * @example
   * ```ts
   * catch (error) {
   *   toastFieldError(error, toast.error)
   *   throw error
   * }
   * ```
   */
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
