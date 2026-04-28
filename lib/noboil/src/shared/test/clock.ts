const realDateNow = Date.now.bind(Date)
const setNow = (ms: number): void => {
  Date.now = (): number => ms
}
const restoreNow = (): void => {
  Date.now = realDateNow
}
const advanceNow = (deltaMs: number): void => {
  const cur = Date.now()
  setNow(cur + deltaMs)
}
const withFakeNow = async <T>(ms: number, fn: () => Promise<T> | T): Promise<T> => {
  setNow(ms)
  try {
    return await fn()
  } finally {
    restoreNow()
  }
}
export { advanceNow, restoreNow, setNow, withFakeNow }
