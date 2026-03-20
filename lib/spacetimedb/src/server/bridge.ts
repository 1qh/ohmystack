const idx = (fn: (ib: unknown) => unknown): never => fn as never,
  flt = (fn: (fb: unknown) => unknown): never => fn as never,
  sch = (fn: (sb: unknown) => unknown): never => fn as never,
  typed = (value: unknown): never => value as never,
  indexFields = (...fields: string[]): never => fields as never
export { flt, idx, indexFields, sch, typed }
