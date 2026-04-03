'use client'
import { useCallback } from 'react'
interface ErrorHelpers<D extends { code: string; message?: string }> {
  extractErrorData: (error: unknown) => D | undefined
  getErrorMessage: (error: unknown) => string
  handleError: (error: unknown, handlers: Record<string, unknown>) => void
}
interface ErrorToastOptions<D extends { code: string; message?: string }> {
  handlers?: Partial<Record<D['code'], (data: D) => void>> & { default?: (error: unknown) => void }
  toast: ToastFn
}
type ToastFn = (message: string) => void
const createErrorToastHooks = <D extends { code: string; message?: string }>(helpers: ErrorHelpers<D>) => {
  const useErrorToast = ({ handlers, toast }: ErrorToastOptions<D>) =>
    useCallback(
      (error: unknown) => {
        const data = helpers.extractErrorData(error)
        const code = data?.code
        const hasSpecificHandler = code ? Object.hasOwn(handlers ?? {}, code) : false
        if (hasSpecificHandler) {
          helpers.handleError(error, handlers ?? {})
          return
        }
        toast(data?.message ?? helpers.getErrorMessage(error))
      },
      [handlers, toast]
    )
  const makeErrorHandler = (toast: ToastFn, overrides?: Partial<Record<D['code'], (data: D) => void>>) => {
    const handler = {
      ...overrides,
      default: () => undefined
    }
    return (error: unknown) => {
      const data = helpers.extractErrorData(error)
      const code = data?.code
      const hasOverride = code ? Object.hasOwn(overrides ?? {}, code) : false
      if (hasOverride) {
        helpers.handleError(error, handler)
        return
      }
      toast(data?.message ?? helpers.getErrorMessage(error))
    }
  }
  const toastFieldError = (
    toastError: unknown,
    toastFn: ToastFn,
    getFirstFieldError?: (e: unknown) => string | undefined
  ): boolean => {
    if (getFirstFieldError) {
      const msg = getFirstFieldError(toastError)
      if (msg) {
        toastFn(msg)
        return true
      }
      return false
    }
    const data = helpers.extractErrorData(toastError)
    const fieldErrors = (data as Record<string, unknown> | undefined)?.fieldErrors as
      | Record<string, string | undefined>
      | undefined
    if (!fieldErrors) return false
    const keys = Object.keys(fieldErrors)
    for (const key of keys) {
      const message = fieldErrors[key]
      if (message) {
        toastFn(message)
        return true
      }
    }
    return false
  }
  return { makeErrorHandler, toastFieldError, useErrorToast }
}
export type { ErrorHelpers, ErrorToastOptions, ToastFn }
export { createErrorToastHooks }
