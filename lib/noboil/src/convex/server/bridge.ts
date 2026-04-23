import type { FilterLike, IndexLike, SearchLike } from './types'
const idx = (fn: (ib: IndexLike) => IndexLike): never => fn as never
const flt = (fn: (fb: FilterLike) => unknown): never => fn as never
const sch = (fn: (sb: SearchLike) => unknown): never => fn as never
const typed = (value: unknown): never => value as never
const indexFields = (...fields: string[]): never => fields as never
export { flt, idx, indexFields, sch, typed }
