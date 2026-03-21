'use client'
import type { BulkMutateToast, BulkProgress, BulkResult, UseBulkMutateOptions } from '@a/shared/react/use-bulk-mutate'
import { collectSettled, createUseBulkMutate } from '@a/shared/react/use-bulk-mutate'
import { BULK_MAX } from '../constants'
import { defaultOnError } from './use-mutate'
const { resolveBulkError, useBulkMutate } = createUseBulkMutate({
  bulkMax: BULK_MAX,
  defaultOnError,
  packageName: '@noboil/spacetimedb'
})
export type { BulkMutateToast, BulkProgress, BulkResult, UseBulkMutateOptions }
export { collectSettled, resolveBulkError, useBulkMutate }
