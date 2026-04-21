// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'
import { useSoftDelete as useSharedSoftDelete } from '@noboil/shared/react/use-soft-delete'
import { UNDO_MS } from '../constants'
interface SoftDeleteOpts<A extends { id: string }> {
  label?: string
  onError?: (error: unknown) => void
  onRestore?: () => void
  restore: (args: A) => Promise<unknown>
  rm: (args: A) => Promise<unknown>
  toast: ToastFn
  undoMs?: number
}
type ToastFn = (message: string, opts?: { action?: { label: string; onClick: () => void }; duration?: number }) => void
const useSoftDelete = <A extends { id: string }>(options: SoftDeleteOpts<A>) =>
  useSharedSoftDelete({ ...options, undoMs: options.undoMs ?? UNDO_MS })
export type { SoftDeleteOpts, ToastFn }
export { useSoftDelete }
