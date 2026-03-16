'use client'

import { useBulkSelection as useSharedBulkSelection } from '@a/shared/react/use-bulk-selection'

import type { ToastFn } from './use-soft-delete'

import { UNDO_MS } from '../constants'

interface UseBulkSelectionOpts {
  items: { _id: string }[]
  onError?: (error: unknown) => void
  onSuccess?: (count: number) => void
  orgId: string
  restore?: (args: { id: string }) => Promise<unknown>
  rm?: (args: { id?: string; ids?: string[]; orgId: string }) => Promise<unknown>
  toast?: ToastFn
  undoMs?: number
}

const useBulkSelection = (options: UseBulkSelectionOpts) =>
  useSharedBulkSelection({
    ...options,
    undoMs: options.undoMs ?? UNDO_MS
  })

export type { UseBulkSelectionOpts }
export { useBulkSelection }
