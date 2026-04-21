'use client'
interface CrudOptions {
  where?: Record<string, unknown>
}
interface CrudRefs<T> {
  create: (data: Partial<T>) => Promise<unknown>
  list: unknown
  rm: (args: { id: unknown }) => Promise<unknown>
  update: (args: Record<string, unknown>) => Promise<unknown>
}
interface CrudResult<T> {
  create: (data: Partial<T>) => Promise<unknown>
  data: T[]
  hasMore: boolean
  isLoading: boolean
  loadMore: () => void
  rm: (id: unknown) => Promise<unknown>
  update: (args: Partial<T> & { id: unknown }) => Promise<unknown>
}
export type { CrudOptions, CrudRefs, CrudResult }
