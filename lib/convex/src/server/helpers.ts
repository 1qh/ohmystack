/* oxlint-disable eslint/no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB mutations */
/** biome-ignore-all lint/suspicious/useAwait: promise-function-async conflict */
/* eslint-disable no-await-in-loop */
/* eslint-disable max-depth */
import type { ErrorData as SharedErrorData, ErrorHandler as SharedErrorHandler } from '@a/shared/server/helpers'
import type { RegisteredQuery } from 'convex/server'
import type { ZodRawShape } from 'zod/v4'
import {
  createErrorUtils,
  generateToken,
  groupList,
  isComparisonOp,
  isRecord,
  log,
  matchW,
  pickFields,
  RUNTIME_FILTER_WARN_THRESHOLD,
  SEVEN_DAYS_MS,
  time as sharedTime
} from '@a/shared/server/helpers'
import { zid } from 'convex-helpers/server/zod4'
import { ConvexError } from 'convex/values'
import { nullable, number, object, string } from 'zod/v4'
import type {
  DbLike,
  ErrorCode,
  FID,
  MutationCtxLike,
  PaginationOptsShape,
  Qb,
  QueryCtxLike,
  RateLimitConfig,
  RateLimitInput,
  StorageLike,
  WithUrls
} from './types'
import { fileKindOf } from '../zod'
import { flt, idx, typed } from './bridge'
import { ERROR_MESSAGES } from './types'
type ConvexErrorData = ErrorData
interface ErrorData extends SharedErrorData {
  code: ErrorCode
}
type ErrorHandler = Partial<Record<ErrorCode, (data: ErrorData) => void>> & {
  default?: (error: unknown) => void
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
const ok = <T>(value: T): MutationResult<T> => ({ ok: true, value })
const time = () => sharedTime()
const extractErrorData = (e: unknown): ErrorData | undefined => {
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
    limit: isRecord(data.limit) ? (data.limit as ErrorData['limit']) : undefined,
    message: typeof data.message === 'string' ? data.message : undefined,
    op: typeof data.op === 'string' ? data.op : undefined,
    retryAfter: typeof data.retryAfter === 'number' ? data.retryAfter : undefined,
    table: typeof data.table === 'string' ? data.table : undefined
  }
}
const throwConvexError = (code: string, opts?: Record<string, unknown> | string | { message: string }): never => {
  if (!opts) throw new ConvexError({ code })
  if (typeof opts !== 'string') throw new ConvexError({ code, ...opts })
  const sep = opts.indexOf(':')
  throw sep > 0
    ? new ConvexError({ code, debug: opts, op: opts.slice(sep + 1), table: opts.slice(0, sep) })
    : new ConvexError({ code, debug: opts })
}
const errorUtils = createErrorUtils({
  errorMessages: ERROR_MESSAGES,
  extractErrorData: extractErrorData as (e: unknown) => SharedErrorData | undefined,
  throwError: throwConvexError
})
const err = (code: ErrorCode, opts?: Record<string, unknown> | string | { message: string }): never =>
  throwConvexError(code, opts)
const { noFetcher } = errorUtils
const errValidation = (
  code: ErrorCode,
  zodError: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }
): never => errorUtils.errValidation(code, zodError)
const getErrorCode = (e: unknown): ErrorCode | undefined => extractErrorData(e)?.code
const getErrorMessage = (e: unknown): string => errorUtils.getErrorMessage(e)
const getErrorDetail = (e: unknown): string => errorUtils.getErrorDetail(e)
const handleError = (e: unknown, handlers: ErrorHandler): void => {
  errorUtils.handleError(e, handlers as SharedErrorHandler)
}
const handleConvexError = handleError
const fail = (code: ErrorCode, detail?: Omit<ErrorData, 'code'>): MutationResult<never> =>
  errorUtils.fail(code, detail) as MutationResult<never>
const isMutationError = (e: unknown): e is ErrorData => extractErrorData(e) !== undefined
const isErrorCode = (e: unknown, code: ErrorCode): boolean => {
  const d = extractErrorData(e)
  return d?.code === code
}
const matchError = <R>(
  e: unknown,
  handlers: Partial<Record<ErrorCode, (data: ErrorData) => R>> & { _?: (error: unknown) => R }
): R | undefined => {
  const d = extractErrorData(e)
  if (d) {
    const handler = handlers[d.code]
    if (handler) return handler(d)
  }
  return handlers._?.(e)
}
// eslint-disable-next-line @typescript-eslint/max-params
const warnLargeFilterSet = (count: number, table: string, context: string, strict?: boolean) => {
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
}
const pgOpts = object({
  cursor: nullable(string()),
  endCursor: nullable(string()).optional(),
  id: number().optional(),
  maximumBytesRead: number().optional(),
  maximumRowsRead: number().optional(),
  numItems: number()
} satisfies PaginationOptsShape)
const detectFiles = <S extends ZodRawShape>(s: S) => (Object.keys(s) as (keyof S & string)[]).filter(k => fileKindOf(s[k]))
const getUser = async ({
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
}
const ownGet =
  (db: DbLike, userId: string) =>
  async (id: string): Promise<Record<string, unknown>> => {
    const d = await db.get(id)
    return d && (d as { userId?: string }).userId === userId ? d : err('NOT_FOUND')
  }
const readCtx = <D = DbLike, S = StorageLike>({
  db,
  storage,
  viewerId
}: {
  db: D
  storage: S
  viewerId: null | string
}) => ({
  db,
  storage,
  viewerId,
  withAuthor: async <T extends { userId: string }>(docs: T[]) => {
    const ids = [...new Set(docs.map(d => d.userId))]
    const users = await Promise.all(ids.map(async id => (db as DbLike).get(id)))
    const map = new Map(ids.map((id, i) => [id, users[i]] as const))
    return docs.map(d => ({ ...d, author: map.get(d.userId) ?? null, own: viewerId ? viewerId === d.userId : null }))
  }
})
const toId = (x: unknown): FID | null => (typeof x === 'string' ? (x as FID) : null)
const cleanFiles = async (opts: {
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
        const nv = next[f]
        const keep = new Set(Array.isArray(nv) ? nv : nv ? [nv] : [])
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
    for (const r of results) if (r.status === 'rejected') log('warn', 'file:cleanup_failed', { reason: String(r.reason) })
  }
}
const addUrls = async <D extends Record<string, unknown>>({
  doc,
  fileFields,
  storage
}: {
  doc: D
  fileFields: string[]
  storage: StorageLike
}): Promise<WithUrls<D>> => {
  if (fileFields.length === 0) return doc as WithUrls<D>
  const o = { ...doc } as Record<string, unknown>
  const getUrl = async (x: unknown) => {
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
}
const dbInsert = async (db: DbLike, table: string, data: Record<string, unknown>) => db.insert(table, data)
const dbPatch = async (db: DbLike, id: string, data: Record<string, unknown>) => db.patch(id, data)
const dbDelete = async (db: DbLike, id: string) => db.delete(id)
const idEquals = (a: string, b: string): boolean => a === b
const RATE_LIMIT_DEFAULT_WINDOW = 60_000
const normalizeRateLimit = (input: RateLimitInput): RateLimitConfig =>
  typeof input === 'number' ? { max: input, window: RATE_LIMIT_DEFAULT_WINDOW } : input
const checkRateLimit = async (db: DbLike, opts: { config: RateLimitConfig; key: string; table: string }) => {
  const { config, key, table } = opts
  const now = Date.now()
  const existing = await Promise.resolve(
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
    const windowStart = existing.windowStart as number
    const retryAfter = config.window - (now - windowStart)
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
const makeUnique = ({
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
        const q = c.db.query(table)
        const existing = await Promise.resolve(
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
export type { ConvexErrorData, ErrorData, ErrorHandler, MutationFail, MutationOk, MutationResult }
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
  handleError,
  idEquals,
  isComparisonOp,
  isErrorCode,
  isMutationError,
  isRecord,
  log,
  makeUnique,
  matchError,
  matchW,
  noFetcher,
  normalizeRateLimit,
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
