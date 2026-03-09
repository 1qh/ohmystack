// biome-ignore-all lint/suspicious/useAwait: async without await
/* eslint-disable max-depth */
import type { ZodObject, output as ZodOutput, ZodRawShape } from 'zod/v4'

import { Identity } from 'spacetimedb'
import { number, object, string } from 'zod/v4'

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
  RateLimitInput,
  StorageLike,
  WithUrls
} from './types'

import { cvFileKindOf } from '../zod'
import { flt, idx, typed } from './bridge'
import { identityEquals } from './reducer-utils'
import { ERROR_MESSAGES } from './types'

class SenderError extends Error {
  /** biome-ignore lint/style/useConsistentMemberAccessibility: biome+eslint conflict */
  public readonly _tag = 'SenderError' as const
  /** biome-ignore lint/style/useConsistentMemberAccessibility: biome+eslint conflict */
  public constructor(message: string) {
    super(message)
    this.name = 'SenderError'
  }
}

const TOKEN_BYTES = 24,
  TOKEN_RADIX = 36,
  TOKEN_LENGTH = 32,
  SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000,
  RATE_LIMIT_DEFAULT_WINDOW = 60_000,
  RUNTIME_FILTER_WARN_THRESHOLD = 1000,
  normalizeRateLimit = (input: RateLimitInput): RateLimitConfig =>
    typeof input === 'number' ? { max: input, window: RATE_LIMIT_DEFAULT_WINDOW } : input,
  generateToken = () => {
    const bytes = new Uint8Array(TOKEN_BYTES)
    crypto.getRandomValues(bytes)
    let token = ''
    for (const b of bytes) token += b.toString(TOKEN_RADIX).padStart(2, '0').slice(0, 2)
    return token.slice(0, TOKEN_LENGTH)
  },
  
  log = (level: 'debug' | 'error' | 'info' | 'warn', msg: string, data?: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console[level](JSON.stringify({ level, msg, ts: Date.now(), ...data }))
  },
  warnLargeFilterSet = ({
    context,
    count,
    strict,
    table
  }: {
    context: string
    count: number
    strict?: boolean
    table: string
  }) => {
    if (count > RUNTIME_FILTER_WARN_THRESHOLD) {
      const msg = `Runtime filtering ${count} docs in "${table}" (${context}) exceeds ${RUNTIME_FILTER_WARN_THRESHOLD} threshold. Add an index for better performance.`
      if (strict) throw new Error(msg)
      log('warn', 'query:large_filter_set', {
        context,
        count,
        table,
        threshold: RUNTIME_FILTER_WARN_THRESHOLD
      })
    }
  },
  
  isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object',
  isComparisonOp = (val: unknown): val is ComparisonOp<unknown> =>
    typeof val === 'object' &&
    val !== null &&
    ('$gt' in val || '$gte' in val || '$lt' in val || '$lte' in val || '$between' in val),
  pgOpts = object({
    limit: number().optional(),
    numItems: number().optional(),
    offset: number().optional()
  } as unknown as Partial<PaginationOptsShape>),
  detectFiles = (s: ZodRawShape) => {
    const keys = Object.keys(s),
      out: string[] = []
    for (const k of keys) if (cvFileKindOf(s[k])) out.push(k)
    return out
  },
  serializeError = (data: ErrorData) => `${data.code}:${JSON.stringify(data)}`,
  
  err = (code: ErrorCode, opts?: Record<string, unknown> | string | { message: string }): never => {
    if (!opts) throw new SenderError(serializeError({ code }))
    if (typeof opts !== 'string') throw new SenderError(serializeError({ code, ...opts }))
    const sep = opts.indexOf(':'),
      data = sep > 0 ? { code, debug: opts, op: opts.slice(sep + 1), table: opts.slice(0, sep) } : { code, debug: opts }
    throw new SenderError(serializeError(data))
  },
  noFetcher = (): never => err('NO_FETCHER'),
  
  time = (timestamp?: number) => ({ updatedAt: timestamp ?? Date.now() }),
  
  identityToHex = (identity: Identity): string => identity.toHexString(),
  
  identityFromHex = (hex: string): Identity => Identity.fromString(hex),
  
  idToWire = String as unknown as (id: number) => string,
  
  idFromWire = (str: string): number => {
    if (!str.trim()) err('VALIDATION_FAILED', { message: 'Wire id must not be empty' })
    const id = Number(str)
    if (!Number.isFinite(id)) err('VALIDATION_FAILED', { message: `Invalid wire id: ${str}` })
    return id
  },
  getUser = async ({
    ctx,
    db,
    getAuthUserId
  }: {
    ctx: MutationCtxLike | QueryCtxLike
    db: DbLike
    getAuthUserId: (c: never) => Promise<null | string>
  }): Promise<Record<string, unknown> & { _id: string }> => {
    const { sender } = ctx as { sender?: Identity },
      uid = sender ? identityToHex(sender) : await getAuthUserId(typed(ctx))
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
        map = new Map(ids.map((id, i) => [id, users[i]] as const)),
        out: (T & {
          author: null | Record<string, unknown>
          own: boolean | null
        })[] = []
      for (const d of docs)
        out.push({ ...d, author: map.get(d.userId) ?? null, own: viewerId ? viewerId === d.userId : null })
      return out
    }
  }),
  toId = (x: unknown): null | string => {
    if (typeof x === 'number') return String(x)
    if (typeof x === 'string') return x
    return null
  },
  callStorageDelete = async (storage: StorageLike, id: string) => {
    const ext = storage as StorageLike & {
      deleteFile?: (id: string) => Promise<void>
    }
    if (typeof ext.deleteFile === 'function') return ext.deleteFile(id)
    return storage.delete(id)
  },
  callStorageGetUrl = async (storage: StorageLike, id: string) => {
    const ext = storage as StorageLike & {
      getSignedUrl?: (id: string) => Promise<null | string>
      getUploadUrl?: (id: string) => Promise<null | string>
    }
    if (typeof ext.getSignedUrl === 'function') return ext.getSignedUrl(id)
    if (typeof ext.getUploadUrl === 'function') return ext.getUploadUrl(id)
    return storage.getUrl(id)
  },
  setArrayUrls = async (opts: {
    getUrl: (x: unknown) => Promise<null | string>
    key: string
    output: Record<string, unknown>
    values: unknown[]
  }) => {
    const { getUrl, key, output, values } = opts
    output[`${key}Urls`] = await Promise.all(values.map(getUrl))
  },
  setSingleUrl = async (opts: {
    getUrl: (x: unknown) => Promise<null | string>
    key: string
    output: Record<string, unknown>
    value: unknown
  }) => {
    const { getUrl, key, output, value } = opts
    output[`${key}Url`] = await getUrl(value)
  },
  cleanFiles = async (opts: {
    doc: Record<string, unknown>
    fileFields: string[]
    next?: Record<string, unknown>
    storage: StorageLike
  }) => {
    const { doc, fileFields, next, storage } = opts
    if (fileFields.length === 0) return
    const del = new Set<string>()
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
      const ids = [...del],
        tasks: Promise<void>[] = []
      for (const id of ids) tasks.push(callStorageDelete(storage, id))
      const results = await Promise.allSettled(tasks)
      for (const r of results)
        if (r.status === 'rejected') log('error', 'file:cleanup_failed', { reason: String(r.reason) })
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
        return id ? callStorageGetUrl(storage, id) : null
      },
      tasks: Promise<void>[] = []
    for (const f of fileFields) {
      const fv = doc[f]
      if (fv !== null)
        if (Array.isArray(fv)) tasks.push(setArrayUrls({ getUrl, key: f, output: o, values: fv }))
        else tasks.push(setSingleUrl({ getUrl, key: f, output: o, value: fv }))
    }
    await Promise.all(tasks)
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
  groupList = <WG extends Record<string, unknown> & { own?: boolean }>(w?: WG & { or?: WG[] }): WG[] => {
    if (!w) return []
    const groups: WG[] = [{ ...w, or: undefined } as WG, ...(w.or ?? [])],
      out: WG[] = []
    for (const g of groups)
      if (g.own) out.push(g)
      else {
        const keys = Object.keys(g)
        let hasField = false
        for (const k of keys) if (k !== 'own' && g[k] !== undefined) hasField = true
        if (hasField) out.push(g)
      }

    return out
  },
  matchW = <WG extends Record<string, unknown> & { own?: boolean }>(
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
    throw new SenderError(
      serializeError({
        code,
        fieldErrors,
        fields,
        message: fields.length > 0 ? `Invalid: ${fields.join(', ')}` : ERROR_MESSAGES.VALIDATION_FAILED
      })
    )
  },
  rlState = new Map<string, { count: number; windowStart: number }>(),
  resetRateLimitState = () => {
    rlState.clear()
  },
  enforceRateLimit = (tableName: string, sender: Identity, config: RateLimitConfig) => {
    const key = `${tableName}:${identityToHex(sender)}`,
      now = Date.now(),
      existing = rlState.get(key)
    if (!existing) {
      rlState.set(key, { count: 1, windowStart: now })
      return
    }
    if (now - existing.windowStart >= config.window) {
      rlState.set(key, { count: 1, windowStart: now })
      return
    }
    if (existing.count >= config.max) {
      const retryAfter = config.window - (now - existing.windowStart)
      err('RATE_LIMITED', {
        debug: `${tableName}:create`,
        limit: { max: config.max, remaining: 0, window: config.window },
        op: 'create',
        retryAfter,
        table: tableName
      })
    }
    existing.count += 1
  },
  dbInsert = async (db: DbLike, table: string, data: Record<string, unknown>) => {
    const d = db as DbLike & Record<string, unknown>,
      tableApi = d[table] as undefined | { insert?: (row: Record<string, unknown>) => Promise<unknown> }
    if (tableApi && typeof tableApi.insert === 'function') {
      const inserted = await tableApi.insert(data),
        fallbackId = typeof data.id === 'number' || typeof data.id === 'string' ? String(data.id) : ''
      return typeof inserted === 'number' || typeof inserted === 'string' ? String(inserted) : fallbackId
    }
    return db.insert(table, data)
  },
  dbPatch = async (db: DbLike, id: string, data: Record<string, unknown>) => {
    const d = db as DbLike & Record<string, unknown>,
      table = data._table
    if (typeof table === 'string') {
      const tableApi = d[table] as
        | undefined
        | {
            id?: { update?: (patch: Record<string, unknown>) => Promise<unknown> }
          }
      if (tableApi?.id && typeof tableApi.id.update === 'function') {
        await tableApi.id.update({ id: Number(id), ...data })
        return
      }
    }
    await db.patch(id, data)
  },
  dbDelete = async (db: DbLike, id: string) => {
    await db.delete(id)
  },
  
  checkRateLimit = async (
    db: DbLike,
    opts: { config: RateLimitConfig; key: string; table: string; timestamp?: number }
  ) => {
    const { config, key, table } = opts,
      now = opts.timestamp ?? Date.now(),
      // biome-ignore lint/nursery/noPlaywrightUselessAwait: .first() returns thenable, await needed for cross-package tsc
      existing = await db
        .query('rateLimit')
        .withIndex(
          'by_table_key',

          idx((q: unknown) =>
            (q as { eq: (field: string, value: unknown) => { eq: (field: string, value: unknown) => unknown } })
              .eq('table', table)
              .eq('key', key)
          )
        )
        .first()
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

interface ErrorData {
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

type TypedFieldErrors<S extends ZodObject<ZodRawShape>> = Partial<Record<keyof ZodOutput<S> & string, string>>

const parseSenderMessage = (message: string): ErrorData | undefined => {
    const sep = message.indexOf(':')
    if (sep <= 0) return
    const code = message.slice(0, sep)
    if (!(code in ERROR_MESSAGES)) return
    const rest = message.slice(sep + 1).trim(),
      data: ErrorData = { code: code as ErrorCode }
    if (rest.startsWith('{') && rest.endsWith('}'))
      try {
        const parsed = JSON.parse(rest) as Record<string, unknown>
        return {
          code: code as ErrorCode,
          debug: typeof parsed.debug === 'string' ? parsed.debug : undefined,
          fieldErrors: isRecord(parsed.fieldErrors) ? (parsed.fieldErrors as Record<string, string>) : undefined,
          fields: Array.isArray(parsed.fields) ? (parsed.fields as string[]) : undefined,
          limit: isRecord(parsed.limit) ? (parsed.limit as ErrorData['limit']) : undefined,
          message: typeof parsed.message === 'string' ? parsed.message : undefined,
          op: typeof parsed.op === 'string' ? parsed.op : undefined,
          retryAfter: typeof parsed.retryAfter === 'number' ? parsed.retryAfter : undefined,
          table: typeof parsed.table === 'string' ? parsed.table : undefined
        }
      } catch {
        return { ...data, debug: 'Error payload was not valid JSON', message: rest }
      }

    return { ...data, message: rest }
  },
  
  extractErrorData = (e: unknown): ErrorData | undefined => {
    if (isRecord(e)) {
      const { data } = e as { data?: unknown }
      if (isRecord(data)) {
        const { code } = data
        if (typeof code === 'string' && code in ERROR_MESSAGES)
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
    }
    if (e instanceof Error) return parseSenderMessage(e.message)
  },
  
  getErrorCode = (e: unknown): ErrorCode | undefined => extractErrorData(e)?.code,
  
  getErrorMessage = (e: unknown): string => {
    const d = extractErrorData(e)
    if (d) return d.message ?? ERROR_MESSAGES[d.code]
    if (e instanceof Error) return e.message
    return 'Unknown error'
  },
  
  getErrorDetail = (e: unknown): string => {
    const d = extractErrorData(e)
    if (!d) return e instanceof Error ? e.message : 'Unknown error'
    const base = d.message ?? ERROR_MESSAGES[d.code]
    let detail = d.table ? `${base} [${d.table}${d.op ? `:${d.op}` : ''}]` : base
    if (d.retryAfter !== undefined) detail += ` (retry after ${d.retryAfter}ms)`
    return detail
  },
  
  handleError = (e: unknown, handlers: ErrorHandler): void => {
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
  
  ok = <T>(value: T): MutationResult<T> => ({ ok: true, value }),
  
  fail = (code: ErrorCode, detail?: Omit<ErrorData, 'code'>): MutationResult<never> => ({
    error: { code, message: ERROR_MESSAGES[code], ...detail },
    ok: false
  }),
  
  isMutationError = (e: unknown): e is ErrorData => extractErrorData(e) !== undefined,
  
  isErrorCode = (e: unknown, code: ErrorCode): boolean => {
    const d = extractErrorData(e)
    return d?.code === code
  },
  
  matchError = <R>(
    e: unknown,
    handlers: Partial<Record<ErrorCode, (data: ErrorData) => R>> & { _?: (error: unknown) => R }
  ): R | undefined => {
    const d = extractErrorData(e)
    if (d) {
      const handler = handlers[d.code]
      if (handler) return handler(d)
    }
    return handlers._?.(e)
  },
  
  getFieldErrors = <S extends ZodObject<ZodRawShape>>(e: unknown): TypedFieldErrors<S> | undefined => {
    const d = extractErrorData(e)
    return d?.fieldErrors as TypedFieldErrors<S> | undefined
  },
  
  getFirstFieldError = (e?: unknown): string | undefined => {
    const d = extractErrorData(e)
    if (!d?.fieldErrors) return
    const keys = Object.keys(d.fieldErrors)
    for (const k of keys) {
      const v = d.fieldErrors[k]
      if (v) return v
    }
  },
  
  makeUnique = ({ field, index, pq, table }: { field: string; index?: string; pq: Qb; table: string }) =>
    typed(
      pq({
        args: { exclude: string().optional(), value: string() },
        handler: typed(async (c: QueryCtxLike, { exclude, value }: { exclude?: string; value: string }) => {
          const q = c.db.query(table),
            /** biome-ignore lint/nursery/useAwaitThenable: query result is async */
            existing = await (index
              ? q
                  .withIndex(
                    index,

                    idx((i: unknown) => (i as { eq: (name: string, v: string) => unknown }).eq(field, value))
                  )
                  .first()
              : q

                  .filter(
                    flt((f: unknown) =>
                      (f as { eq: (left: unknown, right: unknown) => unknown; field: (name: string) => unknown }).eq(
                        (f as { field: (name: string) => unknown }).field(field),
                        value
                      )
                    )
                  )
                  .first())
          return !(existing as null | Record<string, unknown>) || (existing as Record<string, unknown>)._id === exclude
        })
      })
    )

export type { ErrorData, ErrorHandler, MutationFail, MutationOk, MutationResult, TypedFieldErrors }
export {
  addUrls,
  checkRateLimit,
  cleanFiles,
  dbDelete,
  dbInsert,
  dbPatch,
  detectFiles,
  enforceRateLimit,
  err,
  errValidation,
  extractErrorData,
  fail,
  generateToken,
  getErrorCode,
  getErrorDetail,
  getErrorMessage,
  getFieldErrors,
  getFirstFieldError,
  getUser,
  groupList,
  handleError,
  identityEquals,
  identityFromHex,
  identityToHex,
  idFromWire,
  idToWire,
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
  parseSenderMessage,
  pgOpts,
  pickFields,
  readCtx,
  resetRateLimitState,
  RUNTIME_FILTER_WARN_THRESHOLD,
  SEVEN_DAYS_MS,
  time,
  warnLargeFilterSet
}
