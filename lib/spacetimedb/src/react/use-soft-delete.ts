'use client'
import type { SoftDeleteOpts, ToastFn } from '@a/shared/react/use-soft-delete'
import { createUseSoftDelete } from '@a/shared/react/use-soft-delete'
import { UNDO_MS } from '../constants'
const useSoftDelete = createUseSoftDelete(UNDO_MS)
export type { SoftDeleteOpts, ToastFn }
export { useSoftDelete }
