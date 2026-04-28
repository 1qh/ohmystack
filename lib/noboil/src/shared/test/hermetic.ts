type HermeticHandler = (op: string, payload: unknown) => unknown
let adapter: HermeticHandler | null = null
const setHermeticAdapter = (h: HermeticHandler | null): void => {
  adapter = h
}
const hermeticTry = (op: string, payload: unknown): unknown => {
  if (!adapter) return
  return adapter(op, payload)
}
export type { HermeticHandler }
export { hermeticTry, setHermeticAdapter }
