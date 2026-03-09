/* oxlint-disable promise/prefer-await-to-then */
'use client'

import { useCallback } from 'react'

import { UNDO_MS } from '../constants'

type ToastFn = (message: string, opts?: { action?: { label: string; onClick: () => void }; duration?: number }) => void

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
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
