// biome-ignore-all lint/nursery/noFloatingPromises: event handler
'use client'
import { useCallback, useState } from 'react'
interface UseBulkSelectionOpts {
  items: { _id: string }[]
  onError?: (error: unknown) => void
  onSuccess?: (count: number) => void
  orgId: string
  restore?: (args: { id: string }) => Promise<unknown>
  rm?: (args: { id?: string; ids?: string[]; orgId: string }) => Promise<unknown>
  toast?: (message: string, options?: { action?: { label: string; onClick: () => void }; duration?: number }) => void
  undoLabel?: string
  undoMs: number
}
const useBulkSelection = ({
  items,
  onError,
  onSuccess,
  orgId,
  restore,
  rm,
  toast: t,
  undoLabel,
  undoMs
}: UseBulkSelectionOpts) => {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const clear = useCallback(() => {
    setSelected(new Set<string>())
  }, [])
  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const toggleSelectAll = useCallback(() => {
    setSelected(prev => {
      if (prev.size === items.length) return new Set<string>()
      const next = new Set<string>()
      for (const i of items) next.add(i._id)
      return next
    })
  }, [items])
  const handleBulkDelete = useCallback(async () => {
    if (selected.size === 0 || !rm) return
    const ids = [...selected]
    const count = ids.length
    try {
      await rm({ ids, orgId })
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
  }, [onError, onSuccess, orgId, restore, rm, selected, t, undoLabel, undoMs])
  return { clear, handleBulkDelete, selected, toggleSelect, toggleSelectAll }
}
export type { UseBulkSelectionOpts }
export { useBulkSelection }
