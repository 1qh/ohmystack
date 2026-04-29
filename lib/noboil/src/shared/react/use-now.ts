/* oxlint-disable eslint-plugin-promise(prefer-await-to-callbacks) */
/* eslint-disable react-hooks/globals */
import { useSyncExternalStore } from 'react'
const DEFAULT_TICK_MS = 300_000
const subscribers = new Set<() => void>()
let timer: null | ReturnType<typeof setInterval> = null
let snapshot = Date.now()
let currentTickMs = DEFAULT_TICK_MS
const tick = (): void => {
  snapshot = Date.now()
  for (const s of subscribers) s()
}
const subscribe = (cb: () => void): (() => void) => {
  subscribers.add(cb)
  if (subscribers.size === 1) timer = setInterval(tick, currentTickMs)
  return () => {
    subscribers.delete(cb)
    if (subscribers.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}
const getSnapshot = (): number => snapshot
const getServerSnapshot = (): number => 0
const useNow = (tickMs?: number): number => {
  if (tickMs && tickMs !== currentTickMs && timer === null) currentTickMs = tickMs
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
export { useNow }
