/* oxlint-disable promise/prefer-await-to-then */
'use client'

import { useCallback } from 'react'

import { UNDO_MS } from '../constants'

/** Configuration for useSoftDelete: the rm/restore mutations, toast function, and optional callbacks. */
interface SoftDeleteOpts<A extends { id: string }> {
  label?: string
  onError?: (error: unknown) => void
  onRestore?: () => void
  restore: (args: A) => Promise<unknown>
  rm: (args: A) => Promise<unknown>
  toast: ToastFn
  undoMs?: number
}

/** A function that displays a toast with an optional action button and duration. */
type ToastFn = (message: string, opts?: { action?: { label: string; onClick: () => void }; duration?: number }) => void

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
  /**
   * Returns a remove function that soft-deletes an item and shows an undo toast with restore.
   * @param rm The soft-delete mutation
   * @param restore The restore mutation for undo
   * @param toast Toast function for delete/restore feedback
   * @example
   * ```tsx
   * const { remove } = useSoftDelete({ rm: api.wiki.rm, restore: api.wiki.restore, toast })
   * await remove({ id: wiki._id })
   * ```
   */
  useSoftDelete = <A extends { id: string }>({
    label = 'Item',
    onError,
    onRestore,
    restore,
    rm,
    toast: t,
    undoMs = UNDO_MS
  }: SoftDeleteOpts<A>) => {
    const remove = useCallback(
      async (args: A) => {
        await rm(args)
        t(`${cap(label)} deleted`, {
          action: {
            label: 'Undo',
            onClick: () => {
              restore(args)
                .then(() => {
                  t(`${cap(label)} restored`)
                  onRestore?.()
                  return null
                })
                .catch(onError ?? (() => t(`Failed to restore ${label.toLowerCase()}`)))
            }
          },
          duration: undoMs
        })
      },
      [label, onError, onRestore, restore, rm, t, undoMs]
    )

    return { remove }
  }

export type { SoftDeleteOpts, ToastFn }
export { useSoftDelete }
