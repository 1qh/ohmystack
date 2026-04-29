interface Lcg {
  int: (maxExclusive: number) => number
  next: () => number
  pick: <T>(items: readonly T[]) => T
}
const createLcg = (seed: number): Lcg => {
  let state = Math.trunc(seed) || 1
  const next = (): number => {
    state = (Math.trunc(state * 1_664_525) + 1_013_904_223) % 0x1_00_00_00_00
    if (state < 0) state += 0x1_00_00_00_00
    return state / 0x1_00_00_00_00
  }
  const int = (maxExclusive: number): number => Math.floor(next() * maxExclusive)
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error('pick from empty array')
    return items[int(items.length)] as T
  }
  return { int, next, pick }
}
export type { Lcg }
export { createLcg }
