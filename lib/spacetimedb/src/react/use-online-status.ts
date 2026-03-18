// biome-ignore-all lint/nursery/useGlobalThis: browser API
'use client'

import { useSyncExternalStore } from 'react'

const subscribe = (onStoreChange: () => void) => {
    window.addEventListener('online', onStoreChange)
    window.addEventListener('offline', onStoreChange)
    return () => {
      window.removeEventListener('online', onStoreChange)
      window.removeEventListener('offline', onStoreChange)
    }
  },
  getSnapshot = () => navigator.onLine,
  getServerSnapshot = () => true,
  /**
   * Subscribes to browser network connectivity changes.
   * @returns `true` when online, otherwise `false`.
   */
  useOnlineStatus = () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

export default useOnlineStatus
