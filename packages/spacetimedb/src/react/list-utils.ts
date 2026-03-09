'use client'

import type { ComparisonOp } from '../server/types'

type ListSort<T extends Rec> = SortMap<T> | SortObject<T>
type ListWhere<T extends Rec> = WhereGroup<T> & { or?: WhereGroup<T>[] }
type Rec = Record<string, unknown>

type SortDirection = 'asc' | 'desc'

type SortMap<T extends Rec> = Partial<Record<keyof T & string, SortDirection>>
interface SortObject<T extends Rec> {
  direction?: SortDirection
  field: keyof T & string
}
type WhereFieldValue<V> = ComparisonOp<V> | V
type WhereGroup<T extends Rec> = { [K in keyof T & string]?: WhereFieldValue<T[K]> } & { own?: boolean }

const searchMatches = <T extends Rec>(row: T, query: string, fields: (keyof T & string)[]): boolean => {
    const lower = query.toLowerCase()
    for (const field of fields) {
      const val = row[field]
      if (typeof val === 'string' && val.toLowerCase().includes(lower)) return true
      if (Array.isArray(val))
        for (const item of val) if (typeof item === 'string' && item.toLowerCase().includes(lower)) return true
    }
    return false
  },
  
  toSortableString = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
    if (typeof value === 'object' && value !== null)
      try {
        return JSON.stringify(value)
      } catch {
        return Object.prototype.toString.call(value)
      }

    return ''
  },
  
  getSortConfig = <T extends Rec>(sort?: ListSort<T>): null | { direction: SortDirection; field: keyof T & string } => {
    if (!sort) return null
    if ('field' in sort)
      return {
        direction: (sort as SortObject<T>).direction ?? 'desc',
        field: (sort as SortObject<T>).field
      }
    const keys = Object.keys(sort)
    if (keys.length === 0) return null
    const key = keys[0] as keyof T & string,
      direction = (sort as Record<string, SortDirection>)[key] ?? 'desc'
    return { direction, field: key }
  },
  
  compareValues = (left: unknown, right: unknown): number => {
    if (left === right) return 0
    if (left === undefined || left === null) return -1
    if (right === undefined || right === null) return 1
    if (typeof left === 'number' && typeof right === 'number') return left - right
    if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right)
    if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime()
    return toSortableString(left).localeCompare(toSortableString(right))
  },
  
  sortData = <T extends Rec>(rows: readonly T[], sort?: ListSort<T>): T[] => {
    const config = getSortConfig(sort)
    if (!config) return [...rows]
    const factor = config.direction === 'asc' ? 1 : -1,
      out = [...rows]
    out.sort((a, b) => compareValues(a[config.field], b[config.field]) * factor)
    return out
  },
  noop = () => {} // eslint-disable-line @typescript-eslint/no-empty-function

export type { ListSort, ListWhere, Rec, SortDirection, SortMap, SortObject, WhereFieldValue, WhereGroup }
export { compareValues, getSortConfig, noop, searchMatches, sortData, toSortableString }
