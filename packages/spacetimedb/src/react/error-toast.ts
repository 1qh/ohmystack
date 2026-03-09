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
  
  makeErrorHandler = (toast: ToastFn, overrides?: Partial<Record<string, (data?: ErrorData) => void>>) => {
    const handler: ErrorHandlers = {
      default: noop
    }

    if (overrides) {
      const keys = Object.keys(overrides)
      for (const key of keys) {
        const fn = overrides[key]
        if (fn) {
          const wrapped = (data: ErrorData) => fn(data)
          handler[key as ErrorCode] = wrapped
        }
      }
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
