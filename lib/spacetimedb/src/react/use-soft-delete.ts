// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'

import { useCallback } from 'react'

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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
  /**
   * Wraps a delete mutation with undo toast behavior.
   * @param options Soft-delete handlers, labels, and toast adapter.
   * @returns A `remove` callback that deletes an item and offers undo.
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
              const run = async () => {
                try {
                  await restore(args)
                  t(`${cap(label)} restored`)
                  onRestore?.()
                } catch (error) {
                  if (onError) onError(error)
                  else t(`Failed to restore ${label.toLowerCase()}`)
                }
              }
              run()
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
