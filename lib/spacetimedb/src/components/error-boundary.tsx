/** biome-ignore-all lint/style/useReactFunctionComponents: ErrorBoundary requires class component */
/** biome-ignore-all lint/nursery/noRedundantDefaultExport: backward-compat alias */
// biome-ignore-all lint/suspicious/useAwait: async without await
'use client'
import { createErrorBoundary } from '@a/shared/components/error-boundary'
const asRecord = (value: unknown): null | Record<string, unknown> => {
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>
  return null
}
const readErrorCode = (error: Error): string | undefined => {
  const errorRecord = asRecord(error)
  if (!errorRecord) return
  const directCode = errorRecord.code
  if (typeof directCode === 'string' && directCode.length > 0) return directCode
  const dataRecord = asRecord(errorRecord.data)
  if (!dataRecord) return
  const nestedCode = dataRecord.code
  if (typeof nestedCode === 'string' && nestedCode.length > 0) return nestedCode
}
const readErrorMessage = (error: Error): string => {
  const message = ((error as unknown as { message?: string }).message ?? '').trim()
  if (message.length > 0) return message
  return 'Unknown error'
}
const NoboilStdbErrorBoundary = createErrorBoundary({
  readErrorCode,
  readErrorMessage
})
export { NoboilStdbErrorBoundary as BetterspaceErrorBoundary, NoboilStdbErrorBoundary as default, NoboilStdbErrorBoundary }
