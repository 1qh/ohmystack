/** biome-ignore-all lint/suspicious/useAwait: promise-function-async conflict */
/* eslint-disable max-depth */
// biome-ignore-all lint/performance/noAwaitInLoops: x
import type { RegisteredQuery } from 'convex/server'
import type { ZodRawShape } from 'zod/v4'

import { zid } from 'convex-helpers/server/zod4'
import { ConvexError } from 'convex/values'
import { nullable, number, object, string } from 'zod/v4'

import type {
  ComparisonOp,
  DbLike,
  ErrorCode,
  FID,
  MutationCtxLike,
  PaginationOptsShape,
  Qb,
  QueryCtxLike,
  RateLimitConfig,
  StorageLike,
  WithUrls
} from './types'

import { cvFileKindOf } from '../zod'
import { flt, idx, typed } from './bridge'
import { ERROR_MESSAGES } from './types'

const TOKEN_BYTES = 24,
  TOKEN_RADIX = 36,
  TOKEN_LENGTH = 32,
  SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000,
  generateToken = () => {
    const bytes = new Uint8Array(TOKEN_BYTES)
    crypto.getRandomValues(bytes)
    let token = ''
    for (const b of bytes) token += b.toString(TOKEN_RADIX).padStart(2, '0').slice(0, 2)
    return token.slice(0, TOKEN_LENGTH)
  },
  RUNTIME_FILTER_WARN_THRESHOLD = 1000,
  log = (level: 'debug' | 'error' | 'info' | 'warn', msg: string, data?: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console[level](JSON.stringify({ level, msg, ts: Date.now(), ...data }))
  },
  // eslint-disable-next-line @typescript-eslint/max-params
  warnLargeFilterSet = (count: number, table: string, context: string, strict?: boolean) => {
    if (count > RUNTIME_FILTER_WARN_THRESHOLD) {
      const msg = `Runtime filtering ${count} docs in "${table}" (${context}) exceeds ${RUNTIME_FILTER_WARN_THRESHOLD} threshold. Add a Convex index for better performance.`
      if (strict) throw new Error(msg)
      log('warn', 'query:large_filter_set', {
        context,
        count,
        table,
        threshold: RUNTIME_FILTER_WARN_THRESHOLD
      })
    }
  },
  /**
   * Checks if a value is a non-null object (plain record).
   * @param v - The value to check
   * @returns Whether the value is a Record<string, unknown>
   */
  isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object',
  isComparisonOp = (val: unknown): val is ComparisonOp<unknown> =>
    typeof val === 'object' &&
    val !== null &&
    ('$gt' in val || '$gte' in val || '$lt' in val || '$lte' in val || '$between' in val),
  pgOpts = object({
    cursor: nullable(string()),
    endCursor: nullable(string()).optional(),
    id: number().optional(),
    maximumBytesRead: number().optional(),
    maximumRowsRead: number().optional(),
    numItems: number()
  } satisfies PaginationOptsShape),
  detectFiles = <S extends ZodRawShape>(s: S) => (Object.keys(s) as (keyof S & string)[]).filter(k => cvFileKindOf(s[k])),
  /**
   * Throws a ConvexError with the given error code and optional message or debug context.
   * @param code - The error code to throw
   * @param opts - Optional message string or object with message property
   * @returns Never — always throws
   */
  err = (code: ErrorCode, opts?: Record<string, unknown> | string | { message: string }): never => {
    if (!opts) throw new ConvexError({ code })
    if (typeof opts !== 'string') throw new ConvexError({ code, ...opts })
    const sep = opts.indexOf(':')
    throw sep > 0
      ? new ConvexError({ code, debug: opts, op: opts.slice(sep + 1), table: opts.slice(0, sep) })
      : new ConvexError({ code, debug: opts })
  },
  noFetcher = (): never => err('NO_FETCHER'),
  /**
   * Returns an object with the current timestamp as `updatedAt`.
   * @returns Object containing updatedAt set to Date.now()
   */
  time = () => ({ updatedAt: Date.now() }),
  getUser = async ({
    ctx,
    db,
    getAuthUserId
  }: {
    ctx: MutationCtxLike | QueryCtxLike
    db: DbLike
    getAuthUserId: (c: never) => Promise<null | string>
  }): Promise<Record<string, unknown> & { _id: string }> => {
    const uid = await getAuthUserId(typed(ctx))
    if (!uid) return err('NOT_AUTHENTICATED')
    const u = await db.get(uid)
    return (u ?? err('USER_NOT_FOUND')) as Record<string, unknown> & { _id: string }
  },
  ownGet =
    (db: DbLike, userId: string) =>
    async (id: string): Promise<Record<string, unknown>> => {
      const d = await db.get(id)
      return d && (d as { userId?: string }).userId === userId ? d : err('NOT_FOUND')
    },
  readCtx = <D = DbLike, S = StorageLike>({ db, storage, viewerId }: { db: D; storage: S; viewerId: null | string }) => ({
    db,
    storage,
    viewerId,
    withAuthor: async <T extends { userId: string }>(docs: T[]) => {
      const ids = [...new Set(docs.map(d => d.userId))],
        users = await Promise.all(ids.map(async id => (db as DbLike).get(id))),
        map = new Map(ids.map((id, i) => [id, users[i]] as const))
      return docs.map(d => ({ ...d, author: map.get(d.userId) ?? null, own: viewerId ? viewerId === d.userId : null }))
    }
  }),
  toId = (x: unknown): FID | null => (typeof x === 'string' ? (x as FID) : null),
  cleanFiles = async (opts: {
    doc: Record<string, unknown>
    fileFields: string[]
    next?: Record<string, unknown>
    storage: StorageLike
  }) => {
    const { doc, fileFields, next, storage } = opts
    if (fileFields.length === 0) return
    const del = new Set<FID>()
    for (const f of fileFields) {
      const prev = doc[f]
      if (prev !== null) {
        const pArr = Array.isArray(prev) ? prev : [prev]
        if (!next)
          for (const p of pArr) {
            const id = toId(p)
            if (id) del.add(id)
          }
        else if (Object.hasOwn(next, f)) {
          const nv = next[f],
            keep = new Set(Array.isArray(nv) ? nv : nv ? [nv] : [])
          for (const p of pArr)
            if (!keep.has(p as FID)) {
              const id = toId(p)
              if (id) del.add(id)
            }
        }
      }
    }
    if (del.size > 0) {
      const results = await Promise.allSettled([...del].map(async id => storage.delete(id)))
      for (const r of results)
        if (r.status === 'rejected') log('warn', 'file:cleanup_failed', { reason: String(r.reason) })
    }
  },
  addUrls = async <D extends Record<string, unknown>>({
    doc,
    fileFields,
    storage
  }: {
    doc: D
    fileFields: string[]
    storage: StorageLike
  }): Promise<WithUrls<D>> => {
    if (fileFields.length === 0) return doc as WithUrls<D>
    const o = { ...doc } as Record<string, unknown>,
      getUrl = async (x: unknown) => {
        const id = toId(x)
        return id ? storage.getUrl(id) : null
      }
    for (const f of fileFields) {
      const fv = doc[f]
      if (fv !== null)
        o[Array.isArray(fv) ? `${f}Urls` : `${f}Url`] = Array.isArray(fv)
          ? await Promise.all(fv.map(getUrl))
          : await getUrl(fv)
    }
    return o as WithUrls<D>
  },
  matchField = (docVal: unknown, filterVal: unknown): boolean => {
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
  },
  groupList = <WG extends Record<string, unknown> & { own?: boolean }>(w?: WG & { or?: WG[] }): WG[] =>
    w
      ? [{ ...w, or: undefined } as WG, ...(w.or ?? [])].filter(
          g => g.own ?? Object.keys(g).some(k => k !== 'own' && g[k] !== undefined)
        )
      : [],
  matchW = <WG extends Record<string, unknown> & { own?: boolean }>(
    doc: Record<string, unknown>,
    w: undefined | (WG & { or?: WG[] }),
    vid?: null | string
  ) => {
    const gs = groupList(w)
    if (gs.length === 0) return true
    for (const g of gs) {
      const ok = Object.entries(g).every(
        ([k, vl]: [string, unknown]) => k === 'own' || vl === undefined || matchField(doc[k], vl)
      )
      if (ok && (!g.own || vid === (doc as { userId?: string }).userId)) return true
    }
    return false
  },
  pickFields = (data: Record<string, unknown>, keys: string[]): Record<string, unknown> => {
    const result: Record<string, unknown> = {}
    for (const k of keys) if (k in data) result[k] = data[k]
    return result
  },
  errValidation = (
    code: ErrorCode,
    zodError: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }
  ): never => {
    const { fieldErrors: raw } = zodError.flatten(),
      fields: string[] = [],
      fieldErrors: Record<string, string> = {}
    for (const k of Object.keys(raw)) {
      const first = raw[k]?.[0]
      if (first) {
        fields.push(k)
        fieldErrors[k] = first
      }
    }
    throw new ConvexError({
      code,
      fieldErrors,
      fields,
      message: fields.length > 0 ? `Invalid: ${fields.join(', ')}` : 'Validation failed'
    })
  },
  dbInsert = async (db: DbLike, table: string, data: Record<string, unknown>) => db.insert(table, data),
  dbPatch = async (db: DbLike, id: string, data: Record<string, unknown>) => db.patch(id, data),
  dbDelete = async (db: DbLike, id: string) => db.delete(id),
  /**
   * Enforces a sliding-window rate limit by tracking request counts in a `rateLimit` table.
   * @param db - Database handle
   * @param opts - Rate limit configuration with key, table, and config (max, window)
   * @returns Resolves when under limit, throws RATE_LIMITED if exceeded
   */
  checkRateLimit = async (db: DbLike, opts: { config: RateLimitConfig; key: string; table: string }) => {
    const { config, key, table } = opts,
      now = Date.now(),
      existing = await Promise.resolve(
        db
          .query('rateLimit')
          .withIndex(
            'by_table_key',
            idx(q => q.eq('table', table).eq('key', key))
          )
          .first()
      )
    if (!existing) {
      await db.insert('rateLimit', { count: 1, key, table, windowStart: now })
      return
    }
    const windowExpired = now - (existing.windowStart as number) >= config.window
    if (windowExpired) {
      await db.patch(existing._id as string, { count: 1, windowStart: now })
      return
    }
    if ((existing.count as number) >= config.max) {
      const windowStart = existing.windowStart as number,
        retryAfter = config.window - (now - windowStart)
      return err('RATE_LIMITED', {
        debug: `${table}:create`,
        limit: { max: config.max, remaining: 0, window: config.window },
        op: 'create',
        retryAfter,
        table
      })
    }
    await db.patch(existing._id as string, { count: (existing.count as number) + 1 })
  }

/** Structured error data extracted from a ConvexError, containing the error code and optional context. */
interface ConvexErrorData {
  code: ErrorCode
  debug?: string
  fieldErrors?: Record<string, string>
  fields?: string[]
  limit?: { max: number; remaining: number; window: number }
  message?: string
  op?: string
  retryAfter?: number
  table?: string
}

/** Map of error codes to handler functions, with an optional `default` catch-all. */
type ErrorHandler = Partial<Record<ErrorCode, (data: ConvexErrorData) => void>> & {
  default?: (error: unknown) => void
}

/** Represents a failed mutation result containing error data. */
interface MutationFail {
  error: ConvexErrorData
  ok: false
}

/** Represents a successful mutation result containing the return value. */
interface MutationOk<T> {
  ok: true
  value: T
}

/** Discriminated union of success or failure for mutation return values. */
type MutationResult<T> = MutationFail | MutationOk<T>

/**
 * Extracts structured error data from a ConvexError, returning undefined for non-Convex errors.
 * @param e - The error to extract data from
 * @returns Parsed ConvexErrorData or undefined
 */
const extractErrorData = (e: unknown): ConvexErrorData | undefined => {
    if (!(e instanceof ConvexError)) return
    const { data } = e as { data?: unknown }
    if (!isRecord(data)) return
    const { code } = data
    if (typeof code !== 'string' || !(code in ERROR_MESSAGES)) return
    return {
      code: code as ErrorCode,
      debug: typeof data.debug === 'string' ? data.debug : undefined,
      fieldErrors: isRecord(data.fieldErrors) ? (data.fieldErrors as Record<string, string>) : undefined,
      fields: Array.isArray(data.fields) ? (data.fields as string[]) : undefined,
      limit: isRecord(data.limit) ? (data.limit as ConvexErrorData['limit']) : undefined,
      message: typeof data.message === 'string' ? data.message : undefined,
      op: typeof data.op === 'string' ? data.op : undefined,
      retryAfter: typeof data.retryAfter === 'number' ? data.retryAfter : undefined,
      table: typeof data.table === 'string' ? data.table : undefined
    }
  },
  /**
   * Returns the ErrorCode from a ConvexError, or undefined if not a recognized error.
   * @param e - The error to inspect
   * @returns The error code or undefined
   */
  getErrorCode = (e: unknown): ErrorCode | undefined => extractErrorData(e)?.code,
  /**
   * Returns a human-readable error message, falling back to the default message for the error code.
   * @param e - The error to get a message from
   * @returns A human-readable error message string
   */
  getErrorMessage = (e: unknown): string => {
    const d = extractErrorData(e)
    if (d) return d.message ?? ERROR_MESSAGES[d.code]
    if (e instanceof Error) return e.message
    return 'Unknown error'
  },
  /**
   * Returns a detailed error string including table and operation context when available.
   * @param e - The error to describe
   * @returns Detailed error description with optional table/op context
   */
  getErrorDetail = (e: unknown): string => {
    const d = extractErrorData(e)
    if (!d) return e instanceof Error ? e.message : 'Unknown error'
    const base = d.message ?? ERROR_MESSAGES[d.code]
    let detail = d.table ? `${base} [${d.table}${d.op ? `:${d.op}` : ''}]` : base
    if (d.retryAfter !== undefined) detail += ` (retry after ${d.retryAfter}ms)`
    return detail
  },
  /**
   * Dispatches a ConvexError to the matching handler by error code, or calls the `default` handler.
   * @param e - The error to handle
   * @param handlers - Map of error codes to handler callbacks
   */
  handleConvexError = (e: unknown, handlers: ErrorHandler): void => {
    const d = extractErrorData(e)
    if (d) {
      const handler = handlers[d.code]
      if (handler) {
        handler(d)
        return
      }
    }
    handlers.default?.(e)
  },
  /**
   * Wraps a value in a successful MutationResult.
   * @param value - The success value to wrap
   * @returns A MutationResult with ok=true
   * @example
   * const result = ok({ id: '123' })
   * // result.ok === true, result.value === { id: '123' }
   */
  ok = <T>(value: T): MutationResult<T> => ({ ok: true, value }),
  /**
   * Creates a failed MutationResult with the given error code and optional detail.
   * @param code - The error code
   * @param detail - Optional additional error context
   * @returns A MutationResult with ok=false
   * @example
   * const result = fail('NOT_FOUND')
   * // result.ok === false, result.error.code === 'NOT_FOUND'
   */
  fail = (code: ErrorCode, detail?: Omit<ConvexErrorData, 'code'>): MutationResult<never> => ({
    error: { code, message: ERROR_MESSAGES[code], ...detail },
    ok: false
  }),
  /**
   * Returns true if the error is a ConvexError with a recognized error code.
   * @param e - The error to check
   * @returns Whether the error is a known mutation error
   */
  isMutationError = (e: unknown): e is ConvexErrorData => extractErrorData(e) !== undefined,
  /**
   * Returns true if the error matches the specified error code.
   * @param e - The error to check
   * @param code - The error code to match against
   * @returns Whether the error has the given code
   */
  isErrorCode = (e: unknown, code: ErrorCode): boolean => {
    const d = extractErrorData(e)
    return d?.code === code
  },
  /**
   * Pattern-matches a ConvexError against a map of error code handlers, returning the handler's result.
   * @param e - The error to match
   * @param handlers - Map of ErrorCode to handler; use `_` key as fallback
   * @returns The matched handler's return value, or undefined if no match
   * @example
   * const msg = matchError(error, {
   *   NOT_FOUND: () => 'Item not found',
   *   FORBIDDEN: (d) => `Access denied: ${d.table}`,
   *   _: () => 'Unknown error'
   * })
   */
  matchError = <R>(
    e: unknown,
    handlers: Partial<Record<ErrorCode, (data: ConvexErrorData) => R>> & { _?: (error: unknown) => R }
  ): R | undefined => {
    const d = extractErrorData(e)
    if (d) {
      const handler = handlers[d.code]
      if (handler) return handler(d)
    }
    return handlers._?.(e)
  },
  makeUnique = ({
    field,
    index,
    pq,
    table
  }: {
    field: string
    index?: string
    pq: Qb
    table: string
  }): RegisteredQuery<'public', { exclude?: string; value: string }, boolean> =>
    typed(
      pq({
        args: { exclude: zid(table).optional(), value: string() },
        handler: typed(async (c: QueryCtxLike, { exclude, value }: { exclude?: string; value: string }) => {
          const q = c.db.query(table),
            existing = await Promise.resolve(
              index
                ? q
                    .withIndex(
                      index,
                      idx(i => i.eq(field, value))
                    )
                    .first()
                : q.filter(flt(f => f.eq(f.field(field), value))).first()
            )
          return !(existing as null | Record<string, unknown>) || (existing as Record<string, unknown>)._id === exclude
        })
      })
    )

export type { ConvexErrorData, ErrorHandler, MutationFail, MutationOk, MutationResult }
export {
  addUrls,
  checkRateLimit,
  cleanFiles,
  dbDelete,
  dbInsert,
  dbPatch,
  detectFiles,
  err,
  errValidation,
  extractErrorData,
  fail,
  generateToken,
  getErrorCode,
  getErrorDetail,
  getErrorMessage,
  getUser,
  groupList,
  handleConvexError,
  isComparisonOp,
  isErrorCode,
  isMutationError,
  isRecord,
  log,
  makeUnique,
  matchError,
  matchW,
  noFetcher,
  ok,
  ownGet,
  pgOpts,
  pickFields,
  readCtx,
  RUNTIME_FILTER_WARN_THRESHOLD,
  SEVEN_DAYS_MS,
  time,
  warnLargeFilterSet
}
