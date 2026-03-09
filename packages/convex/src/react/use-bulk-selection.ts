// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'

import { useCallback, useMemo, useState } from 'react'

import type { ToastFn } from './use-soft-delete'

import { UNDO_MS } from '../constants'

interface UseBulkSelectionOpts {
  bulkRm?: (args: { ids: string[]; orgId: string }) => Promise<unknown>
  items: { _id: string }[]
  onError?: (error: unknown) => void
  onSuccess?: (count: number) => void
  orgId: string
  restore?: (args: { id: string }) => Promise<unknown>
  rm?: (id: string) => Promise<unknown>
  toast?: ToastFn
  undoLabel?: string
  undoMs?: number
}

const useBulkSelection = ({
  bulkRm,
  items,
  onError,
  onSuccess,
  orgId,
  restore,
  rm,
  toast: t,
  undoLabel,
  undoMs = UNDO_MS
}: UseBulkSelectionOpts) => {
  const effectiveBulkRm = useMemo(
      () =>
        bulkRm ??
        (rm
          ? async ({ ids }: { ids: string[] }) => {
              const tasks: Promise<unknown>[] = []
              for (const id of ids) tasks.push(rm(id))
              await Promise.all(tasks)
            }
          : undefined),
      [bulkRm, rm]
    ),
    [selected, setSelected] = useState<Set<string>>(() => new Set()),
    clear = useCallback(() => {
      setSelected(new Set<string>())
    }, []),
    toggleSelect = useCallback((id: string) => {
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }, []),
    toggleSelectAll = useCallback(() => {
      if (selected.size === items.length) {
        setSelected(new Set<string>())
        return
      }
      const next = new Set<string>()
      for (const i of items) next.add(i._id)
      setSelected(next)
    }, [items, selected.size]),
    handleBulkDelete = useCallback(async () => {
      if (selected.size === 0 || !effectiveBulkRm) return
      const ids = [...selected],
        count = ids.length
      try {
        await effectiveBulkRm({ ids, orgId })
        setSelected(new Set<string>())
        if (!(t && restore)) {
          onSuccess?.(count)
          return
        }
        const label = undoLabel ?? 'item'
        t(`${count} ${label}${count === 1 ? '' : 's'} deleted`, {
          action: {
            label: 'Undo',
            onClick: () => {
              const run = async () => {
                try {
                  const tasks: Promise<unknown>[] = []
                  for (const id of ids) tasks.push(restore({ id }))
                  await Promise.all(tasks)
                  t(`${count} ${label}${count === 1 ? '' : 's'} restored`)
                } catch (error) {
                  onError?.(error)
                }
              }
              run()
            }
          },
          duration: undoMs
        })
      } catch (error) {
        onError?.(error)
      }
    }, [effectiveBulkRm, onError, onSuccess, orgId, restore, selected, t, undoLabel, undoMs])

  return { clear, handleBulkDelete, selected, toggleSelect, toggleSelectAll }
}

export type { UseBulkSelectionOpts }
export { useBulkSelection }
