'use client'
import type { StdbCrudRefs } from './use-crud'
type ReducerMap = Record<string, unknown>
type TableMap = Record<string, { tableName: string }>
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const createApi = <T extends TableMap>(
  tables: T,
  reducers: ReducerMap,
  tableNames?: string[]
): { [K in keyof T]: StdbCrudRefs } => {
  const names = tableNames ?? Object.keys(tables)
  const api: Record<string, StdbCrudRefs> = {}
  for (const name of names) {
    const table = tables[name]
    if (table) {
      const cap = capitalize(name)
      api[name] = {
        create: reducers[`create${cap}`],
        rm: reducers[`rm${cap}`],
        table,
        update: reducers[`update${cap}`]
      }
    }
  }
  return api as { [K in keyof T]: StdbCrudRefs }
}
export { createApi }
