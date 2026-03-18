import type { FilterLike, IndexLike, SearchLike } from './types'

const idx = (fn: (ib: IndexLike) => IndexLike): never => fn as never,
  flt = (fn: (fb: FilterLike) => unknown): never => fn as never,
  sch = (fn: (sb: SearchLike) => unknown): never => fn as never,
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  typed = <T>(value: T): never => value as never,
  indexFields = (...fields: string[]): never => fields as never

export { flt, idx, indexFields, sch, typed }
