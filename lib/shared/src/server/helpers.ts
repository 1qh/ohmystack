interface ComparisonOp<V> {
  $between?: [V, V]
  $gt?: V
  $gte?: V
  $lt?: V
  $lte?: V
}
interface ErrorData {
  code: string
  debug?: string
  fieldErrors?: Record<string, string>
  fields?: string[]
  limit?: { max: number; remaining: number; window: number }
  message?: string
  op?: string
  retryAfter?: number
  table?: string
}
type ErrorHandler = Partial<Record<string, (data: ErrorData) => void>> & {
  default?: (error: unknown) => void
}
interface ErrorUtilsConfig {
  errorMessages: Record<string, string>
  extractErrorData: (e: unknown) => ErrorData | undefined
  throwError: (code: string, opts?: Record<string, unknown> | string | { message: string }) => never
}
interface MutationFail {
  error: ErrorData
  ok: false
}
interface MutationOk<T> {
  ok: true
  value: T
}
type MutationResult<T> = MutationFail | MutationOk<T>
const TOKEN_BYTES = 24
const TOKEN_LENGTH = 48
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const RUNTIME_FILTER_WARN_THRESHOLD = 1000
const generateToken = () => {
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  let token = ''
  for (const b of bytes) token += b.toString(16).padStart(2, '0')
  return token.slice(0, TOKEN_LENGTH)
}
const log = (level: 'debug' | 'error' | 'info' | 'warn', msg: string, data?: Record<string, unknown>) => {
  // eslint-disable-next-line no-console
  console[level](JSON.stringify({ level, msg, ts: Date.now(), ...data }))
}
const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const isComparisonOp = (val: unknown): val is ComparisonOp<unknown> =>
  typeof val === 'object' &&
  val !== null &&
  ('$gt' in val || '$gte' in val || '$lt' in val || '$lte' in val || '$between' in val)
const matchField = (docVal: unknown, filterVal: unknown): boolean => {
  if (isComparisonOp(filterVal)) {
    const dv = docVal as number
    if (filterVal.$gt !== undefined && !(dv > (filterVal.$gt as number))) return false
    if (filterVal.$gte !== undefined && !(dv >= (filterVal.$gte as number))) return false
    if (filterVal.$lt !== undefined && !(dv < (filterVal.$lt as number))) return false
    if (filterVal.$lte !== undefined && !(dv <= (filterVal.$lte as number))) return false
    if (filterVal.$between !== undefined) {
      const [min, max] = filterVal.$between as [number, number]
      if (!(dv >= min && dv <= max)) return false
    }
    return true
  }
  return Object.is(docVal, filterVal)
}
const pickFields = (data: Record<string, unknown>, keys: string[]): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  for (const k of keys) if (k in data) result[k] = data[k]
  return result
}
const groupList = <WG extends Record<string, unknown> & { own?: boolean }>(w?: WG & { or?: WG[] }): WG[] => {
  if (!w) return []
  const groups: WG[] = [{ ...w, or: undefined }, ...(w.or ?? [])]
  const out: WG[] = []
  for (const g of groups)
    if (g.own) out.push(g)
    else {
      const keys = Object.keys(g)
      let hasField = false
      for (const k of keys) if (k !== 'own' && g[k] !== undefined) hasField = true
      if (hasField) out.push(g)
    }
  return out
}
const matchW = <WG extends Record<string, unknown> & { own?: boolean }>(
  doc: Record<string, unknown>,
  w: undefined | (WG & { or?: WG[] }),
  vid?: null | string
) => {
  const gs = groupList(w)
  if (gs.length === 0) return true
  for (const g of gs) {
    const entries = Object.entries(g)
    let ok = true
    for (const [k, vl] of entries) if (!(k === 'own' || vl === undefined || matchField(doc[k], vl))) ok = false
    const isOwn =
      'own' in doc
        ? (doc as { own: boolean }).own
        : vid !== undefined && vid !== null && vid === (doc as { userId?: string }).userId
    if (ok && (!g.own || isOwn)) return true
  }
  return false
}
const time = (timestamp?: number) => ({ updatedAt: timestamp ?? Date.now() })
const ok = <T>(value: T): MutationResult<T> => ({ ok: true, value })
const createErrorUtils = (config: ErrorUtilsConfig) => {
  const { errorMessages, extractErrorData, throwError } = config
  const err = throwError
  const noFetcher = (): never => throwError('NO_FETCHER')
  const errValidation = (
    code: string,
    zodError: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }
  ): never => {
    const { fieldErrors: raw } = zodError.flatten()
    const fields: string[] = []
    const fieldErrors: Record<string, string> = {}
    for (const k of Object.keys(raw)) {
      const first = raw[k]?.[0]
      if (first) {
        fields.push(k)
        fieldErrors[k] = first
      }
    }
    return throwError(code, {
      fieldErrors,
      fields,
      message: fields.length > 0 ? `Invalid: ${fields.join(', ')}` : (errorMessages[code] ?? 'Validation failed')
    })
  }
  const getErrorCode = (e: unknown): string | undefined => extractErrorData(e)?.code
  const getErrorMessage = (e: unknown): string => {
    const d = extractErrorData(e)
    if (d) return d.message ?? errorMessages[d.code] ?? 'Unknown error'
    if (e instanceof Error) return e.message
    return 'Unknown error'
  }
  const getErrorDetail = (e: unknown): string => {
    const d = extractErrorData(e)
    if (!d) return e instanceof Error ? e.message : 'Unknown error'
    const base = d.message ?? errorMessages[d.code] ?? 'Unknown error'
    let detail = d.table ? `${base} [${d.table}${d.op ? `:${d.op}` : ''}]` : base
    if (d.retryAfter !== undefined) detail += ` (retry after ${d.retryAfter}ms)`
    return detail
  }
  const handleError = (e: unknown, handlers: ErrorHandler): void => {
    const d = extractErrorData(e)
    if (d) {
      const handler = handlers[d.code]
      if (handler) {
        handler(d)
        return
      }
    }
    handlers.default?.(e)
  }
  const fail = (code: string, detail?: Omit<ErrorData, 'code'>): MutationResult<never> => ({
    error: { code, message: errorMessages[code] ?? 'Unknown error', ...detail },
    ok: false
  })
  const isMutationError = (e: unknown): e is ErrorData => extractErrorData(e) !== undefined
  const isErrorCode = (e: unknown, code: string): boolean => {
    const d = extractErrorData(e)
    return d?.code === code
  }
  const matchError = <R>(
    e: unknown,
    handlers: Partial<Record<string, (data: ErrorData) => R>> & { _?: (error: unknown) => R }
  ): R | undefined => {
    const d = extractErrorData(e)
    if (d) {
      const handler = handlers[d.code]
      if (handler) return handler(d)
    }
    return handlers._?.(e)
  }
  return {
    err,
    errValidation,
    extractErrorData,
    fail,
    getErrorCode,
    getErrorDetail,
    getErrorMessage,
    handleError,
    isErrorCode,
    isMutationError,
    matchError,
    noFetcher
  }
}
export type { ComparisonOp, ErrorData, ErrorHandler, ErrorUtilsConfig, MutationFail, MutationOk, MutationResult }
export {
  createErrorUtils,
  generateToken,
  groupList,
  isComparisonOp,
  isRecord,
  log,
  matchField,
  matchW,
  ok,
  pickFields,
  RUNTIME_FILTER_WARN_THRESHOLD,
  SEVEN_DAYS_MS,
  time,
  TOKEN_BYTES,
  TOKEN_LENGTH
}
