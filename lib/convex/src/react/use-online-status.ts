'use client'
import { useSyncExternalStore } from 'react'
const subscribe = (onStoreChange: () => void) => {
  globalThis.addEventListener('online', onStoreChange)
  globalThis.addEventListener('offline', onStoreChange)
  return () => {
    globalThis.removeEventListener('online', onStoreChange)
    globalThis.removeEventListener('offline', onStoreChange)
  }
}
const getSnapshot = () => navigator.onLine
const getServerSnapshot = () => true
/** Returns whether the browser is currently online, reactively updating on connectivity changes. */
const useOnlineStatus = () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
export default useOnlineStatus
