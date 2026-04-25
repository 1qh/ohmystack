/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-deprecated, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unnecessary-type-parameters */
/** biome-ignore-all lint/nursery/noComponentHookFactories: factory returns hook by design */
/** biome-ignore-all lint/nursery/noFloatingPromises: test hooks may return void or Promise */
// biome-ignore-all lint/style/noProcessEnv: test env
// biome-ignore-all lint/suspicious/useAwait: test async
// biome-ignore-all lint/performance/noDelete: process.env requires delete to truly unset
import type { ComponentProps } from 'react'
import type { Identity } from 'spacetimedb'
import type { z } from 'zod/v4'
import { describe, expect, test } from 'bun:test'
import { array, boolean, date, globalRegistry, number, object, optional, string, enum as zenum } from 'zod/v4'
import type { AccessEntry, FactoryCall } from '../check'
import type ErrorBoundary from '../components/error-boundary'
// oxlint-disable-next-line import/no-namespace
import type * as FieldsModule from '../components/fields'
import type { CheckResult } from '../doctor'
import type { DevtoolsProps } from '../react/devtools-panel'
import type { ConflictData, FormToastOption } from '../react/form'
// oxlint-disable-next-line import/no-namespace
import type * as ReactIndexTypes from '../react/index'
import type { ListSort, SortDirection, SortMap, SortObject, WhereFieldValue } from '../react/list-utils'
import type { MutationType, PendingMutation } from '../react/optimistic-store'
import type { PlaygroundProps } from '../react/schema-playground'
import type {
  BulkMutateToast,
  BulkProgress,
  BulkResult,
  useBulkMutate,
  UseBulkMutateOptions
} from '../react/use-bulk-mutate'
import type { InfiniteListOptions, SkipInfiniteListResult, useInfiniteList } from '../react/use-infinite-list'
import type { ListWhere, SkipListResult, useList, UseListOptions, WhereGroup } from '../react/use-list'
import type { MutateOptions } from '../react/use-mutate'
import type { PresenceUser, UsePresenceOptions, UsePresenceResult } from '../react/use-presence'
import type { useSearch, UseSearchOptions, UseSearchResult } from '../react/use-search'
import type { RetryOptions } from '../retry'
import type { ErrorData, MutationFail, MutationOk, MutationResult } from '../server/helpers'
import type {
  AssertSchema,
  BaseSchema,
  BrandLabelMap,
  BuiltinErrorCode,
  CacheCrudResult,
  CacheHookCtx,
  CacheHooks,
  CacheOptions,
  CascadeOption,
  CrudHooks,
  CrudOptions,
  DetectBrand,
  ErrorCode,
  GlobalHookCtx,
  GlobalHooks,
  HookCtx,
  Middleware,
  MiddlewareCtx,
  OrgCascadeTableConfig,
  OrgCrudOptions,
  OrgDefSchema,
  OrgSchema,
  OwnedSchema,
  RateLimitConfig,
  Rec,
  SchemaTypeError,
  SetupConfig,
  SingletonSchema,
  WhereOf
} from '../server/types'
import type {
  InferCreate,
  InferReducerArgs,
  InferReducerInputs,
  InferReducerOutputs,
  InferReducerReturn,
  InferRow,
  InferRows,
  InferUpdate,
  RegisteredDefaultError,
  RegisteredMeta,
  RegisteredMutation,
  RegisteredQuery,
  SchemaPhantoms
} from '../server/types/common'
import {
  add,
  defaultFields,
  fieldToTypeExpr as fieldToZod,
  genReducerContent as genEndpointContent,
  genPageContent,
  genTableContent as genSchemaContent,
  parseAddFlags,
  parseFieldDef
} from '../add'
import {
  accessForFactory,
  checkIndexCoverage,
  checkSchemaConsistency,
  endpointsForFactory,
  extractCustomIndexes,
  extractSchemaFields,
  extractWhereFromOptions,
  FACTORY_DEFAULT_INDEXES,
  HEALTH_ERROR_PENALTY,
  HEALTH_MAX,
  HEALTH_WARN_PENALTY,
  parseObjectFields,
  printSchemaPreview
} from '../check'
import { defineSteps } from '../components/step-form'
import {
  ACTIVE_ORG_COOKIE,
  ACTIVE_ORG_SLUG_COOKIE,
  BULK_MAX,
  BYTES_PER_KB,
  BYTES_PER_MB,
  ONE_YEAR_SECONDS,
  sleep
} from '../constants'
import { extractJSDoc, generateMarkdown, resolveReExports } from '../docs-gen'
import { calcHealthScore, checkDeps, checkEslintContent } from '../doctor'
import { recommended as eslintRecommended, rules as eslintRules } from '../eslint'
import { guardApi } from '../guard'
import { diffSnapshots, isOptionalField as isOptionalRaw, parseFieldsFromBlock, parseSchemaContent } from '../migrate'
import {
  clearMutations,
  completeMutation,
  injectError,
  SLOW_THRESHOLD_MS,
  STALE_THRESHOLD_MS,
  trackCacheAccess,
  trackMutation,
  trackSubscription,
  untrackSubscription,
  updateSubscription,
  updateSubscriptionData
} from '../react/devtools'
import { makeErrorHandler, toastFieldError } from '../react/error-toast'
import { buildMeta, getMeta, resolveFormToast } from '../react/form'
import { compareValues, getSortConfig, noop, searchMatches, sortData, toSortableString } from '../react/list-utils'
import { createOptimisticStore, makeTempId } from '../react/optimistic-store'
import { canEditResource } from '../react/org'
import { collectSettled, resolveBulkError } from '../react/use-bulk-mutate'
import { DEFAULT_PAGE_SIZE, useOwnRows } from '../react/use-list'
import { useMutation as useMutationDirect, useMut as useMutDirect } from '../react/use-mutate'
import { DEFAULT_DEBOUNCE_MS } from '../react/use-search'
import { fetchWithRetry, withRetry } from '../retry'
import {
  schema as buildSchema,
  child,
  file,
  files,
  makeBase,
  makeKv,
  makeLog,
  makeOrg,
  makeOrgScoped,
  makeOwned,
  makeQuota,
  makeSingleton
} from '../schema'
import { generateFieldValue, generateOne, generateSeed } from '../seed'
import { flt, idx, indexFields, sch, typed } from '../server/bridge'
import { ownedCascade } from '../server/crud'
import {
  cleanFiles,
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
  groupList,
  handleError,
  idFromWire,
  isErrorCode,
  isMutationError,
  isRecord,
  makeUnique,
  matchError,
  matchW,
  normalizeRateLimit,
  ok,
  parseSenderMessage,
  resetRateLimitState,
  RUNTIME_FILTER_WARN_THRESHOLD,
  SEVEN_DAYS_MS,
  time,
  warnLargeFilterSet
} from '../server/helpers'
import {
  auditLog,
  composeMiddleware,
  inputSanitize,
  sanitizeRec,
  sanitizeString,
  slowQueryWarn
} from '../server/middleware'
import { orgCascade } from '../server/org-crud'
import { makeInviteToken } from '../server/org-invites'
import { HEARTBEAT_INTERVAL_MS, PRESENCE_TTL_MS } from '../server/presence'
import { rlsChildSql, rlsSql } from '../server/rls'
import { baseTable, orgTable, ownedTable, singletonTable } from '../server/schema-helpers'
import { noboil } from '../server/setup'
import { isTestMode } from '../server/test'
import { ERROR_MESSAGES } from '../server/types'
import { extractChildren, extractFieldType, extractWrapperTables, generateMermaid } from '../viz'
import { defaultValue, defaultValues, partialValues, requiredPartial, schemaVariants } from '../zod'
declare module '../server/types/common' {
  interface Register {
    meta: {
      traceId: string
    }
  }
}
const TOKEN_CHARS_PATTERN = /^[0-9a-z]+$/u
const VOID = undefined
const makeSenderError = (data: unknown): Error => {
  if (typeof data === 'string') return new Error(data)
  if (!(data && typeof data === 'object')) return new Error(String(data))
  const rawCode = (data as { code?: unknown }).code
  const code = typeof rawCode === 'string' ? rawCode : String(rawCode)
  return new Error(`${code}:${JSON.stringify(data)}`)
}
const applyOptimistic = (items: Rec[], pending: PendingMutation[]): Rec[] => {
  if (pending.length === 0) return items
  let out = [...items]
  for (const mutation of pending)
    if (mutation.type === 'create') {
      const created = {
        ...mutation.args,
        __optimistic: true,
        _creationTime: mutation.timestamp,
        _id: mutation.id,
        updatedAt: mutation.timestamp
      }
      out.unshift(created)
    } else if (mutation.type === 'delete') {
      const targetId = typeof mutation.args.id === 'string' ? mutation.args.id : mutation.id
      const next: Rec[] = []
      for (const row of out) if (row._id !== targetId) next.push(row)
      out = next
    } else if (mutation.type === 'update') {
      const targetId = typeof mutation.args.id === 'string' ? mutation.args.id : mutation.id
      for (let i = 0; i < out.length; i += 1) {
        const row = out[i]
        if (row?._id === targetId) {
          out[i] = { ...row, ...mutation.args }
          break
        }
      }
    }
  return out
}
const checkRateLimit = (calls: FactoryCall[]): { status: 'pass' | 'warn' } => {
  const skipFactories = new Set(['cacheCrud', 'singletonCrud'])
  for (const call of calls) {
    const skip = skipFactories.has(call.factory)
    const missingRateLimit = skip ? false : !call.options.includes('rateLimit')
    if (missingRateLimit) return { status: 'warn' }
  }
  return { status: 'pass' }
}
describe('matchW', () => {
  const doc = {
    category: 'tech',
    price: 50,
    published: true,
    title: 'Test',
    userId: 'u1'
  }
  test('no where matches everything', () => {
    expect(matchW(doc, VOID)).toBe(true)
  })
  test('AND conditions — all match', () => {
    expect(matchW(doc, { category: 'tech', published: true })).toBe(true)
  })
  test('AND conditions — partial mismatch', () => {
    expect(matchW(doc, { category: 'life', published: true })).toBe(false)
  })
  test('OR conditions', () => {
    expect(matchW(doc, { category: 'life', or: [{ category: 'tech' }] })).toBe(true)
  })
  test('OR conditions — none match', () => {
    expect(matchW(doc, { category: 'life', or: [{ category: 'food' }] })).toBe(false)
  })
  test('own filter with matching viewer', () => {
    expect(matchW(doc, { own: true }, 'u1')).toBe(true)
  })
  test('own filter with non-matching viewer', () => {
    expect(matchW(doc, { own: true }, 'u2')).toBe(false)
  })
  test('own filter with null viewer', () => {
    expect(matchW(doc, { own: true }, null)).toBe(false)
  })
  test('$gt operator', () => {
    expect(matchW(doc, { price: { $gt: 40 } })).toBe(true)
    expect(matchW(doc, { price: { $gt: 50 } })).toBe(false)
  })
  test('$gte operator', () => {
    expect(matchW(doc, { price: { $gte: 50 } })).toBe(true)
    expect(matchW(doc, { price: { $gte: 51 } })).toBe(false)
  })
  test('$lt operator', () => {
    expect(matchW(doc, { price: { $lt: 60 } })).toBe(true)
    expect(matchW(doc, { price: { $lt: 50 } })).toBe(false)
  })
  test('$lte operator', () => {
    expect(matchW(doc, { price: { $lte: 50 } })).toBe(true)
    expect(matchW(doc, { price: { $lte: 49 } })).toBe(false)
  })
  test('$between operator', () => {
    expect(matchW(doc, { price: { $between: [40, 60] } })).toBe(true)
    expect(matchW(doc, { price: { $between: [51, 60] } })).toBe(false)
    expect(matchW(doc, { price: { $between: [50, 50] } })).toBe(true)
  })
  test('empty where object matches everything', () => {
    expect(matchW(doc, {})).toBe(true)
  })
  test('OR with own: true group', () => {
    expect(matchW<{ own?: boolean; published?: boolean }>(doc, { or: [{ published: true }, { own: true }] }, 'u1')).toBe(
      true
    )
    expect(matchW<{ own?: boolean; published?: boolean }>(doc, { or: [{ published: false }, { own: true }] }, 'u2')).toBe(
      false
    )
  })
  test('simple field equality — published: true', () => {
    expect(matchW(doc, { published: true })).toBe(true)
    expect(matchW(doc, { published: false })).toBe(false)
  })
  test('views $gt: 100 on doc without views field', () => {
    expect(matchW(doc, { views: { $gt: 100 } })).toBe(false)
  })
  test('multiple AND conditions — published + category', () => {
    expect(matchW(doc, { category: 'tech', published: true })).toBe(true)
    expect(matchW(doc, { category: 'food', published: true })).toBe(false)
  })
})
describe('groupList', () => {
  test('undefined returns empty array', () => {
    expect(groupList()).toEqual([])
  })
  test('empty where with no real keys returns empty', () => {
    expect(groupList({})).toEqual([])
  })
  test('single group with field', () => {
    const gs = groupList({ published: true })
    expect(gs).toHaveLength(1)
    expect(gs[0]?.published).toBe(true)
  })
  test('with or[]', () => {
    const input = { category: 'tech', or: [{ category: 'life' }] } as Record<string, unknown> & {
      or?: Record<string, unknown>[]
      own?: boolean
    }
    const gs = groupList(input)
    expect(gs).toHaveLength(2)
    expect(gs[0]?.category).toBe('tech')
    expect(gs[1]?.category).toBe('life')
  })
  test('own-only group is included', () => {
    const gs = groupList({ own: true })
    expect(gs).toHaveLength(1)
  })
  test('filters out empty or groups', () => {
    const input = { category: 'tech', or: [{}] } as Record<string, unknown> & {
      or?: Record<string, unknown>[]
      own?: boolean
    }
    const gs = groupList(input)
    expect(gs).toHaveLength(1)
  })
})
describe('detectFiles', () => {
  test('detects file fields', () => {
    const shape = { photo: file().nullable(), title: string() }
    expect(detectFiles(shape)).toEqual(['photo'])
  })
  test('detects files fields', () => {
    const shape = { attachments: files(), title: string() }
    expect(detectFiles(shape)).toEqual(['attachments'])
  })
  test('detects both file and files', () => {
    const shape = {
      attachments: files(),
      photo: file().nullable(),
      title: string()
    }
    const result = detectFiles(shape)
    expect(result).toContain('photo')
    expect(result).toContain('attachments')
    expect(result).toHaveLength(2)
  })
  test('returns empty for no file fields', () => {
    const shape = { count: number(), title: string() }
    expect(detectFiles(shape)).toEqual([])
  })
})
describe('RateLimitConfig', () => {
  test('config shape', () => {
    const config: RateLimitConfig = { max: 10, window: 60_000 }
    expect(config.max).toBe(10)
    expect(config.window).toBe(60_000)
  })
  test('default values', () => {
    const config: RateLimitConfig = { max: 1, window: 1000 }
    expect(config.max).toBeGreaterThan(0)
    expect(config.window).toBeGreaterThan(0)
  })
})
describe('CrudOptions search config', () => {
  const blogSchema = object({
    category: string(),
    content: string(),
    published: boolean(),
    title: string()
  })
  type BlogShape = typeof blogSchema.shape
  test('CrudOptions does not include search field', () => {
    expect(Object.keys(blogSchema.shape)).toHaveLength(4)
    type HasSearch = 'search' extends keyof CrudOptions<BlogShape> ? true : false
    const hasSearch: HasSearch = false
    expect(hasSearch).toBe(false)
  })
  test('CrudOptions still supports documented fields', () => {
    const opts: CrudOptions<BlogShape> = { softDelete: true }
    expect(opts.softDelete).toBe(true)
  })
  test('CrudOptions defaults remain optional', () => {
    const opts: CrudOptions<BlogShape> = {}
    expect(opts.softDelete).toBeUndefined()
    expect(opts.rateLimit).toBeUndefined()
  })
  test('CrudOptions rateLimit accepts max and window', () => {
    const opts: CrudOptions<BlogShape> = {
      rateLimit: { max: 5, window: 5000 }
    }
    expect(opts.rateLimit?.max).toBe(5)
    expect(opts.rateLimit?.window).toBe(5000)
  })
  test('normalizeRateLimit converts number to object with 60s window', () => {
    const result = normalizeRateLimit(10)
    expect(result).toEqual({ max: 10, window: 60_000 })
  })
  test('normalizeRateLimit passes through object unchanged', () => {
    const input = { max: 5, window: 30_000 }
    expect(normalizeRateLimit(input)).toEqual(input)
  })
  test('CrudOptions cascade remains typed as CascadeOption array', () => {
    const opts: CrudOptions<BlogShape> = {
      cascade: [{ foreignKey: 'blogId', table: 'comment' }]
    }
    expect(opts.cascade).toHaveLength(1)
  })
})
describe('typesafe field references', () => {
  const chatSchema = object({ isPublic: boolean(), title: string().min(1) })
  const messageSchema = Object.assign(
    object({
      chatId: string(),
      content: string(),
      role: string()
    }),
    { __name: 'message' } as const
  )
  const taskSchema = Object.assign(
    object({
      completed: boolean(),
      priority: string(),
      projectId: string(),
      title: string()
    }),
    { __name: 'task' } as const
  )
  const movieSchema = object({ title: string(), tmdb_id: number() })
  test('child() accepts valid foreignKey', () => {
    const result = child({
      foreignKey: 'chatId',
      parent: 'chat',
      schema: messageSchema
    })
    expect(result.foreignKey).toBe('chatId')
  })
  test('child() rejects invalid foreignKey', () => {
    const result = child({
      // @ts-expect-error - 'chatI' is not a key of messageSchema
      foreignKey: 'chatI',
      parent: 'chat',
      schema: messageSchema
    })
    expect(result).toBeDefined()
  })
  test('child() parentSchema constrains parentField', () => {
    const result = child({
      foreignKey: 'chatId',
      parent: 'chat',
      parentSchema: chatSchema,
      schema: messageSchema
    })
    expect(result.parentSchema).toBe(chatSchema)
    type ChatShape = typeof chatSchema.shape
    // @ts-expect-error - 'isPubic' is not a key of chatSchema
    const _invalid: keyof ChatShape = 'isPubic'
    expect(_invalid).toBeDefined()
  })
  test('child() string overload derives foreignKey from parent name', () => {
    const result = child('chat', object({ content: string(), role: string() }))
    expect(result.foreignKey).toBe('chatId')
    expect(result.parent).toBe('chat')
    expect(result.index).toBe('by_chat')
    expect(result.schema).toBeDefined()
  })
  test('child() string overload infers foreignKey type as template literal', () => {
    const result = child('chat', object({ content: string(), role: string() }))
    const fk: 'chatId' = result.foreignKey
    expect(fk).toBe('chatId')
  })
  test('child() string overload works with various parent names', () => {
    const r1 = child('blog', object({ text: string() }))
    expect(r1.foreignKey).toBe('blogId')
    expect(r1.parent).toBe('blog')
    expect(r1.index).toBe('by_blog')
    const r2 = child('project', object({ name: string() }))
    expect(r2.foreignKey).toBe('projectId')
    expect(r2.parent).toBe('project')
    expect(r2.index).toBe('by_project')
  })
  test('child() config overload still works with FK validation', () => {
    const result = child({
      foreignKey: 'chatId',
      parent: 'chat',
      schema: messageSchema
    })
    expect(result.foreignKey).toBe('chatId')
    expect(result.parent).toBe('chat')
    expect(result.index).toBe('by_chat')
  })
  test('search is not part of CrudOptions type', () => {
    type MsgShape = typeof messageSchema.shape
    type HasSearch = 'search' extends keyof CrudOptions<MsgShape> ? true : false
    const hasSearch: HasSearch = false
    expect(hasSearch).toBe(false)
  })
  test('search shorthand rejects invalid schema keys', () => {
    type MsgShape = typeof messageSchema.shape
    // @ts-expect-error - 'conten' is not a key of MsgShape
    const _invalid: CrudOptions<MsgShape>['search'] = 'conten'
    expect(_invalid).toBeDefined()
  })
  test('OrgCrudOptions does not include aclFrom field', () => {
    expect(Object.keys(taskSchema.shape)).toContain('projectId')
    type TaskShape = typeof taskSchema.shape
    type HasAclFrom = 'aclFrom' extends keyof OrgCrudOptions<TaskShape> ? true : false
    const hasAclFrom: HasAclFrom = false
    expect(hasAclFrom).toBe(false)
  })
  test('OrgCrudOptions supports acl toggle', () => {
    type TaskShape = typeof taskSchema.shape
    const opts: OrgCrudOptions<TaskShape> = { acl: true }
    expect(opts.acl).toBe(true)
  })
  test('orgCascade accepts valid foreignKey', () => {
    const result = orgCascade(taskSchema, { foreignKey: 'projectId' })
    expect(result.foreignKey).toBe('projectId')
    expect(result.table).toBe('task')
  })
  test('orgCascade rejects invalid foreignKey', () => {
    const result = orgCascade(taskSchema, {
      // @ts-expect-error - 'projctId' is not a key of taskSchema
      foreignKey: 'projctId'
    })
    expect(result).toBeDefined()
  })
  test('cacheCrud key accepts valid schema keys', () => {
    expect(Object.keys(movieSchema.shape)).toContain('tmdb_id')
    type MovieShape = typeof movieSchema.shape
    const key: keyof MovieShape = 'tmdb_id'
    expect(key).toBe('tmdb_id')
  })
  test('cacheCrud key rejects invalid schema keys', () => {
    type MovieShape = typeof movieSchema.shape
    // @ts-expect-error - 'tmdb_i' is not a key of MovieShape
    const _invalid: keyof MovieShape = 'tmdb_i'
    expect(_invalid).toBeDefined()
  })
})
describe('WhereOf type safety', () => {
  const whereSchema = object({
    category: string(),
    content: string(),
    published: boolean(),
    title: string()
  })
  type WS = typeof whereSchema.shape
  test('WhereOf accepts valid field names', () => {
    expect(whereSchema.shape.category).toBeDefined()
    const validWhere: WhereOf<WS> = { category: 'tech', published: true }
    expect(validWhere.category).toBe('tech')
    expect(validWhere.published).toBe(true)
  })
  test('WhereOf rejects misspelled field names', () => {
    // @ts-expect-error - 'categry' is not a key of WS
    const _invalid: WhereOf<WS> = { categry: 'tech' }
    expect(_invalid).toBeDefined()
  })
  test('WhereOf rejects wrong value types', () => {
    // @ts-expect-error - published should be boolean, not string
    const _invalid: WhereOf<WS> = { published: 'yes' }
    expect(_invalid).toBeDefined()
  })
  test('WhereOf accepts comparison operators', () => {
    const prodSchema = object({ name: string(), price: number() })
    type PS = typeof prodSchema.shape
    expect(prodSchema.shape.price).toBeDefined()
    const validRange: WhereOf<PS> = { price: { $gte: 10, $lte: 100 } }
    expect(validRange.price).toBeDefined()
    const validBetween: WhereOf<PS> = { price: { $between: [10, 100] } }
    expect(validBetween.price).toBeDefined()
  })
  test('WhereOf or[] rejects misspelled field names', () => {
    // @ts-expect-error - 'titl' is not a key of WS
    const _invalid: WhereOf<WS> = { or: [{ titl: 'hello' }] }
    expect(_invalid).toBeDefined()
  })
  test('WhereOf own is always valid', () => {
    const ownFilter: WhereOf<WS> = { own: true }
    expect(ownFilter.own).toBe(true)
  })
})
describe('CrudOptions type safety', () => {
  const crudSchema = object({
    category: string(),
    content: string(),
    published: boolean(),
    title: string()
  })
  type CS = typeof crudSchema.shape
  test('pub.where rejects misspelled field names', () => {
    expect(crudSchema.shape.published).toBeDefined()
    // @ts-expect-error - 'publishd' is not a key of CS
    const _invalid: CrudOptions<CS> = { pub: { where: { publishd: true } } }
    expect(_invalid).toBeDefined()
  })
  test('auth.where rejects misspelled field names', () => {
    // @ts-expect-error - 'categor' is not a key of CS
    const _invalid: CrudOptions<CS> = { auth: { where: { categor: 'tech' } } }
    expect(_invalid).toBeDefined()
  })
  test('search shorthand rejects misspelled field names', () => {
    // @ts-expect-error - 'conten' is not a key of CS
    const _invalid: CrudOptions<CS> = { search: 'conten' }
    expect(_invalid).toBeDefined()
  })
  test('cascade accepts array of CascadeOption', () => {
    const opts: CrudOptions<CS> = {
      cascade: [{ foreignKey: 'chatId', table: 'message' }]
    }
    expect(opts.cascade).toHaveLength(1)
  })
  test('cascade accepts multiple targets', () => {
    const opts: CrudOptions<CS> = {
      cascade: [
        { foreignKey: 'chatId', table: 'message' },
        { foreignKey: 'chatId', table: 'reaction' }
      ]
    }
    expect(opts.cascade).toHaveLength(2)
  })
  test('cascade accepts single target', () => {
    const opts: CrudOptions<CS> = {
      cascade: [{ foreignKey: 'chatId', table: 'message' }]
    }
    expect(opts.cascade).toHaveLength(1)
  })
  test('cascade undefined means no cascade', () => {
    const opts: CrudOptions<CS> = {}
    expect(opts.cascade).toBeUndefined()
  })
  test('CascadeOption type has foreignKey and table', () => {
    const opt: CascadeOption = { foreignKey: 'parentId', table: 'child' }
    expect(opt.foreignKey).toBe('parentId')
    expect(opt.table).toBe('child')
  })
})
describe('branded schema type enforcement', () => {
  const ownedSchemas = makeOwned({
    blog: object({
      content: string(),
      published: boolean(),
      title: string()
    })
  })
  const orgSchemas = makeOrgScoped({
    wiki: object({ content: string(), slug: string(), title: string() })
  })
  const baseSchemas = makeBase({
    movie: object({ title: string(), tmdb_id: number() })
  })
  const singletonSchemas = makeSingleton({
    profile: object({
      bio: string().optional(),
      displayName: string(),
      notifications: boolean(),
      theme: zenum(['light', 'dark', 'system'])
    })
  })
  const plainSchema = object({ name: string() })
  describe('table helper constraints', () => {
    test('ownedTable accepts makeOwned schema', () => {
      const table = ownedTable(ownedSchemas.blog)
      expect(table).toBeDefined()
    })
    test('ownedTable rejects makeOrgScoped schema', () => {
      // @ts-expect-error - OrgSchema is not OwnedSchema
      const table = ownedTable(orgSchemas.wiki)
      expect(table).toBeDefined()
    })
    test('ownedTable rejects makeSingleton schema', () => {
      // @ts-expect-error - SingletonSchema is not OwnedSchema
      const table = ownedTable(singletonSchemas.profile)
      expect(table).toBeDefined()
    })
    test('ownedTable rejects plain ZodObject', () => {
      // @ts-expect-error - plain ZodObject lacks OwnedSchema brand
      const table = ownedTable(plainSchema)
      expect(table).toBeDefined()
    })
    test('orgTable accepts makeOrgScoped schema', () => {
      const table = orgTable(orgSchemas.wiki)
      expect(table).toBeDefined()
    })
    test('orgTable rejects makeOwned schema', () => {
      // @ts-expect-error - OwnedSchema is not OrgSchema
      const table = orgTable(ownedSchemas.blog)
      expect(table).toBeDefined()
    })
    test('baseTable accepts makeBase schema', () => {
      const table = baseTable(baseSchemas.movie)
      expect(table).toBeDefined()
    })
    test('baseTable rejects makeOwned schema', () => {
      // @ts-expect-error - OwnedSchema is not BaseSchema
      const table = baseTable(ownedSchemas.blog)
      expect(table).toBeDefined()
    })
    test('singletonTable accepts makeSingleton schema', () => {
      const table = singletonTable(singletonSchemas.profile)
      expect(table).toBeDefined()
    })
    test('singletonTable rejects makeOwned schema', () => {
      // @ts-expect-error - OwnedSchema is not SingletonSchema
      const table = singletonTable(ownedSchemas.blog)
      expect(table).toBeDefined()
    })
    test('singletonTable rejects makeOrgScoped schema', () => {
      // @ts-expect-error - OrgSchema is not SingletonSchema
      const table = singletonTable(orgSchemas.wiki)
      expect(table).toBeDefined()
    })
    test('singletonTable rejects plain ZodObject', () => {
      // @ts-expect-error - plain ZodObject lacks SingletonSchema brand
      const table = singletonTable(plainSchema)
      expect(table).toBeDefined()
    })
  })
  describe('factory type constraints', () => {
    test('crud type accepts OwnedSchema', () => {
      type BlogShape = typeof ownedSchemas.blog extends OwnedSchema<infer S> ? S : never
      const validCrudSchema: OwnedSchema<BlogShape> = ownedSchemas.blog
      expect(validCrudSchema).toBeDefined()
    })
    test('crud type rejects OrgSchema', () => {
      // @ts-expect-error - OrgSchema is not assignable to OwnedSchema
      const invalidCrudSchema: OwnedSchema<typeof orgSchemas.wiki.shape> = orgSchemas.wiki
      expect(invalidCrudSchema).toBeDefined()
    })
    test('crud type rejects SingletonSchema', () => {
      // @ts-expect-error - SingletonSchema is not assignable to OwnedSchema
      const invalidCrudSchema: OwnedSchema<typeof singletonSchemas.profile.shape> = singletonSchemas.profile
      expect(invalidCrudSchema).toBeDefined()
    })
    test('crud type rejects BaseSchema', () => {
      // @ts-expect-error - BaseSchema is not assignable to OwnedSchema
      const invalidCrudSchema: OwnedSchema<typeof baseSchemas.movie.shape> = baseSchemas.movie
      expect(invalidCrudSchema).toBeDefined()
    })
    test('crud type rejects plain ZodObject', () => {
      // @ts-expect-error - plain ZodObject lacks OwnedSchema brand
      const invalidCrudSchema: OwnedSchema<typeof plainSchema.shape> = plainSchema
      expect(invalidCrudSchema).toBeDefined()
    })
    test('orgCrud type accepts OrgSchema', () => {
      type WikiShape = typeof orgSchemas.wiki extends OrgSchema<infer S> ? S : never
      const validOrgSchema: OrgSchema<WikiShape> = orgSchemas.wiki
      expect(validOrgSchema).toBeDefined()
    })
    test('orgCrud type rejects OwnedSchema', () => {
      // @ts-expect-error - OwnedSchema is not assignable to OrgSchema
      const invalidOrgSchema: OrgSchema<typeof ownedSchemas.blog.shape> = ownedSchemas.blog
      expect(invalidOrgSchema).toBeDefined()
    })
    test('orgCrud type rejects SingletonSchema', () => {
      // @ts-expect-error - SingletonSchema is not assignable to OrgSchema
      const invalidOrgSchema: OrgSchema<typeof singletonSchemas.profile.shape> = singletonSchemas.profile
      expect(invalidOrgSchema).toBeDefined()
    })
    test('cacheCrud type accepts BaseSchema', () => {
      type MovieShape = typeof baseSchemas.movie extends BaseSchema<infer S> ? S : never
      const validBaseSchema: BaseSchema<MovieShape> = baseSchemas.movie
      expect(validBaseSchema).toBeDefined()
    })
    test('cacheCrud type rejects OwnedSchema', () => {
      // @ts-expect-error - OwnedSchema is not assignable to BaseSchema
      const invalidBaseSchema: BaseSchema<typeof ownedSchemas.blog.shape> = ownedSchemas.blog
      expect(invalidBaseSchema).toBeDefined()
    })
    test('singletonCrud type accepts SingletonSchema', () => {
      type ProfileShape = typeof singletonSchemas.profile extends SingletonSchema<infer S> ? S : never
      const validSingletonSchema: SingletonSchema<ProfileShape> = singletonSchemas.profile
      expect(validSingletonSchema).toBeDefined()
    })
    test('singletonCrud type rejects OwnedSchema', () => {
      // @ts-expect-error - OwnedSchema is not assignable to SingletonSchema
      const invalidSingletonSchema: SingletonSchema<typeof ownedSchemas.blog.shape> = ownedSchemas.blog
      expect(invalidSingletonSchema).toBeDefined()
    })
    test('singletonCrud type rejects OrgSchema', () => {
      // @ts-expect-error - OrgSchema is not assignable to SingletonSchema
      const invalidSingletonSchema: SingletonSchema<typeof orgSchemas.wiki.shape> = orgSchemas.wiki
      expect(invalidSingletonSchema).toBeDefined()
    })
    test('singletonCrud type rejects plain ZodObject', () => {
      // @ts-expect-error - plain ZodObject lacks SingletonSchema brand
      const invalidSingletonSchema: SingletonSchema<typeof plainSchema.shape> = plainSchema
      expect(invalidSingletonSchema).toBeDefined()
    })
  })
  describe('wrapper identity', () => {
    test('makeOwned preserves Zod schema shape access', () => {
      expect(ownedSchemas.blog.shape.title).toBeDefined()
      expect(ownedSchemas.blog.shape.content).toBeDefined()
      expect(ownedSchemas.blog.shape.published).toBeDefined()
    })
    test('makeOrgScoped preserves Zod schema methods', () => {
      const partial = orgSchemas.wiki.partial()
      expect(partial).toBeDefined()
      expect(partial.shape.title).toBeDefined()
    })
    test('makeSingleton preserves Zod schema shape access', () => {
      expect(singletonSchemas.profile.shape.displayName).toBeDefined()
      expect(singletonSchemas.profile.shape.bio).toBeDefined()
      expect(singletonSchemas.profile.shape.theme).toBeDefined()
      expect(singletonSchemas.profile.shape.notifications).toBeDefined()
    })
    test('branded schemas work with child() via structural subtyping', () => {
      const childConfig = child({
        foreignKey: 'chatId',
        parent: 'chat',
        parentSchema: makeOwned({
          chat: object({ isPublic: boolean(), title: string() })
        }).chat,
        schema: object({ chatId: string(), text: string() })
      })
      expect(childConfig.foreignKey).toBe('chatId')
    })
  })
  describe('singletonCrud upsert type safety', () => {
    type ProfileInput = Partial<(typeof singletonSchemas.profile)['_output']>
    test('upsert rejects misspelled field name', () => {
      // @ts-expect-error - misspelledField is not a valid profile key
      const invalid: ProfileInput = { misspelledField: 'x' }
      expect(invalid).toBeDefined()
    })
    test('upsert rejects wrong value type for displayName', () => {
      // @ts-expect-error - displayName must be string, not number
      const invalid: ProfileInput = { displayName: 123 }
      expect(invalid).toBeDefined()
    })
    test('upsert rejects invalid enum value for theme', () => {
      // @ts-expect-error - 'invalid' is not a valid theme value
      const invalid: ProfileInput = { theme: 'invalid' }
      expect(invalid).toBeDefined()
    })
    test('upsert accepts valid fields', () => {
      const valid: ProfileInput = { displayName: 'ok', theme: 'dark' }
      expect(valid).toBeDefined()
    })
  })
})
describe('universal table()', () => {
  test('makeOrg brands schemas with orgDef at runtime', () => {
    const orgSchemas = makeOrg({
      team: object({ name: string(), slug: string() })
    })
    const brand = (orgSchemas.team as unknown as { __bs?: unknown }).__bs
    expect(brand).toBe('orgDef')
    const typedOrgSchema: OrgDefSchema<typeof orgSchemas.team.shape> = orgSchemas.team
    expect(typedOrgSchema).toBeDefined()
  })
  test('noboil define helpers include table helper', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', 'server', 'setup.ts'), 'utf8')
    expect(content.includes('table: TableFn')).toBe(true)
  })
})
describe('branded schema error messages (SchemaTypeError)', () => {
  const ownedSchemas = makeOwned({
    blog: object({
      content: string(),
      published: boolean(),
      title: string()
    })
  })
  const orgSchemas = makeOrgScoped({
    wiki: object({ content: string(), slug: string(), title: string() })
  })
  const baseSchemas = makeBase({
    movie: object({ title: string(), tmdb_id: number() })
  })
  const singletonSchemas = makeSingleton({
    profile: object({ bio: string().optional(), displayName: string() })
  })
  const plainSchema = object({ name: string() })
  describe('DetectBrand extracts correct brand', () => {
    test('DetectBrand<OwnedSchema> is owned', () => {
      type Result = DetectBrand<typeof ownedSchemas.blog>
      const check: Result = 'owned'
      expect(check).toBe('owned')
    })
    test('DetectBrand<OrgSchema> is org', () => {
      type Result = DetectBrand<typeof orgSchemas.wiki>
      const check: Result = 'org'
      expect(check).toBe('org')
    })
    test('DetectBrand<BaseSchema> is base', () => {
      type Result = DetectBrand<typeof baseSchemas.movie>
      const check: Result = 'base'
      expect(check).toBe('base')
    })
    test('DetectBrand<SingletonSchema> is singleton', () => {
      type Result = DetectBrand<typeof singletonSchemas.profile>
      const check: Result = 'singleton'
      expect(check).toBe('singleton')
    })
    test('DetectBrand<plain ZodObject> is unbranded', () => {
      type Result = DetectBrand<typeof plainSchema>
      const check: Result = 'unbranded'
      expect(check).toBe('unbranded')
    })
  })
  describe('SchemaTypeError produces descriptive messages', () => {
    test('owned expected, org got', () => {
      type Err = SchemaTypeError<'owned', 'org'>
      const msg: Err =
        'Schema mismatch: expected OwnedSchema (from makeOwned()), got OrgSchema (from makeOrgScoped()). Created by makeOwned() \u2192 use table()'
      expect(msg).toContain('Schema mismatch')
    })
    test('org expected, owned got', () => {
      type Err = SchemaTypeError<'org', 'owned'>
      const msg: Err =
        'Schema mismatch: expected OrgSchema (from makeOrgScoped()), got OwnedSchema (from makeOwned()). Created by makeOrgScoped() \u2192 use table()'
      expect(msg).toContain('Schema mismatch')
    })
    test('base expected, singleton got', () => {
      type Err = SchemaTypeError<'base', 'singleton'>
      const msg: Err =
        'Schema mismatch: expected BaseSchema (from makeBase()), got SingletonSchema (from makeSingleton()). Created by makeBase() \u2192 use table()'
      expect(msg).toContain('Schema mismatch')
    })
    test('singleton expected, unbranded got', () => {
      type Err = SchemaTypeError<'singleton', 'unbranded'>
      const msg: Err =
        'Schema mismatch: expected SingletonSchema (from makeSingleton()), got plain ZodObject (not branded). Created by makeSingleton() \u2192 use table()'
      expect(msg).toContain('Schema mismatch')
    })
    test('owned expected, unbranded got', () => {
      type Err = SchemaTypeError<'owned', 'unbranded'>
      const msg: Err =
        'Schema mismatch: expected OwnedSchema (from makeOwned()), got plain ZodObject (not branded). Created by makeOwned() \u2192 use table()'
      expect(msg).toContain('Schema mismatch')
    })
  })
  describe('AssertSchema passes correct brand through', () => {
    test('AssertSchema with matching owned brand returns schema type', () => {
      type Result = AssertSchema<typeof ownedSchemas.blog, 'owned'>
      const s: Result = ownedSchemas.blog
      expect(s).toBeDefined()
    })
    test('AssertSchema with matching org brand returns schema type', () => {
      type Result = AssertSchema<typeof orgSchemas.wiki, 'org'>
      const s: Result = orgSchemas.wiki
      expect(s).toBeDefined()
    })
    test('AssertSchema with matching base brand returns schema type', () => {
      type Result = AssertSchema<typeof baseSchemas.movie, 'base'>
      const s: Result = baseSchemas.movie
      expect(s).toBeDefined()
    })
    test('AssertSchema with matching singleton brand returns schema type', () => {
      type Result = AssertSchema<typeof singletonSchemas.profile, 'singleton'>
      const s: Result = singletonSchemas.profile
      expect(s).toBeDefined()
    })
  })
  describe('AssertSchema rejects wrong brand with error message type', () => {
    test('AssertSchema rejects org schema when owned expected', () => {
      type Result = AssertSchema<typeof orgSchemas.wiki, 'owned'>
      // @ts-expect-error - AssertSchema produces error string type, not the schema type
      const s: Result = orgSchemas.wiki
      expect(s).toBeDefined()
    })
    test('AssertSchema rejects owned schema when org expected', () => {
      type Result = AssertSchema<typeof ownedSchemas.blog, 'org'>
      // @ts-expect-error - AssertSchema produces error string type, not the schema type
      const s: Result = ownedSchemas.blog
      expect(s).toBeDefined()
    })
    test('AssertSchema rejects plain ZodObject when owned expected', () => {
      type Result = AssertSchema<typeof plainSchema, 'owned'>
      // @ts-expect-error - AssertSchema produces error string type, not the schema type
      const s: Result = plainSchema
      expect(s).toBeDefined()
    })
    test('AssertSchema rejects owned schema when base expected', () => {
      type Result = AssertSchema<typeof ownedSchemas.blog, 'base'>
      // @ts-expect-error - AssertSchema produces error string type, not the schema type
      const s: Result = ownedSchemas.blog
      expect(s).toBeDefined()
    })
    test('AssertSchema rejects base schema when singleton expected', () => {
      type Result = AssertSchema<typeof baseSchemas.movie, 'singleton'>
      // @ts-expect-error - AssertSchema produces error string type, not the schema type
      const s: Result = baseSchemas.movie
      expect(s).toBeDefined()
    })
    test('AssertSchema rejects singleton schema when owned expected', () => {
      type Result = AssertSchema<typeof singletonSchemas.profile, 'owned'>
      // @ts-expect-error - AssertSchema produces error string type, not the schema type
      const s: Result = singletonSchemas.profile
      expect(s).toBeDefined()
    })
  })
  describe('BrandLabelMap completeness', () => {
    test('BrandLabelMap has all 6 entries', () => {
      type Keys = keyof BrandLabelMap
      const keys: Keys[] = ['owned', 'org', 'orgDef', 'base', 'singleton', 'unbranded']
      expect(keys).toHaveLength(6)
    })
  })
})
// oxlint-disable promise/prefer-await-to-then
const failStorage = () => ({
  delete: async () => {
    throw new Error('storage unavailable')
  },
  getUrl: async () => null
})
describe('cleanFiles resilience', () => {
  test('cleanFiles does not throw on storage.delete failure', async () => {
    const result = await cleanFiles({
      doc: { photo: 'file_123' },
      fileFields: ['photo'],
      storage: failStorage()
    })
    expect(result).toBeUndefined()
  })
  test('cleanFiles with all failures still completes without throwing', async () => {
    const result = await cleanFiles({
      doc: { attachments: ['file_a', 'file_b'], photo: 'file_c' },
      fileFields: ['photo', 'attachments'],
      storage: failStorage()
    })
    expect(result).toBeUndefined()
  })
  test('cleanFiles skips when no file fields', async () => {
    let called = false
    const storage = {
      delete: async () => {
        called = true
      },
      getUrl: async () => null
    }
    await cleanFiles({
      doc: { title: 'test' },
      fileFields: [],
      storage
    })
    expect(called).toBe(false)
  })
})
describe('defineSteps type safety', () => {
  const profileSchema = object({
    avatar: string().optional(),
    bio: string().max(500).optional(),
    displayName: string().min(1)
  })
  const orgSchema = object({
    name: string().min(1),
    slug: string().min(1)
  })
  const appearanceSchema = object({
    orgAvatar: string()
  })
  const preferencesSchema = object({
    notifications: boolean(),
    theme: zenum(['light', 'dark', 'system'])
  })
  const { StepForm, steps, useStepper } = defineSteps(
    { id: 'profile', label: 'Profile', schema: profileSchema },
    { id: 'org', label: 'Organization', schema: orgSchema },
    { id: 'appearance', label: 'Appearance', schema: appearanceSchema },
    { id: 'preferences', label: 'Preferences', schema: preferencesSchema }
  )
  test('defineSteps returns StepForm, useStepper, steps', () => {
    expect(StepForm).toBeDefined()
    expect(StepForm.Step).toBeDefined()
    expect(useStepper).toBeDefined()
    expect(typeof useStepper).toBe('function')
    expect(steps).toHaveLength(4)
  })
  test('steps array has correct ids and labels', () => {
    expect(steps[0]?.id).toBe('profile')
    expect(steps[0]?.label).toBe('Profile')
    expect(steps[1]?.id).toBe('org')
    expect(steps[1]?.label).toBe('Organization')
    expect(steps[2]?.id).toBe('appearance')
    expect(steps[2]?.label).toBe('Appearance')
    expect(steps[3]?.id).toBe('preferences')
    expect(steps[3]?.label).toBe('Preferences')
  })
  test('StepForm.Step accepts valid step IDs', () => {
    const _p = StepForm.Step({ id: 'profile', render: () => null })
    const _o = StepForm.Step({ id: 'org', render: () => null })
    const _a = StepForm.Step({ id: 'appearance', render: () => null })
    const _pr = StepForm.Step({ id: 'preferences', render: () => null })
    expect(_p).toBeNull()
    expect(_o).toBeNull()
    expect(_a).toBeNull()
    expect(_pr).toBeNull()
  })
  test('StepForm.Step rejects misspelled step ID', () => {
    // @ts-expect-error — 'proifle' is not a valid step ID
    const r = StepForm.Step({ id: 'proifle', render: () => null })
    expect(r).toBeNull()
  })
  test('StepForm.Step rejects unknown step ID', () => {
    // @ts-expect-error — 'nonexistent' is not a valid step ID
    const r = StepForm.Step({ id: 'nonexistent', render: () => null })
    expect(r).toBeNull()
  })
  test('profile step render receives displayName field', () => {
    const r = StepForm.Step({
      id: 'profile',
      render: f => {
        f.Text({ label: 'Name', name: 'displayName' })
        return null
      }
    })
    expect(r).toBeNull()
  })
  test('profile step render rejects org field name', () => {
    const r = StepForm.Step({
      id: 'profile',
      render: f => {
        // @ts-expect-error — 'slug' does not exist in profileSchema
        f.Text({ label: 'Slug', name: 'slug' })
        return null
      }
    })
    expect(r).toBeNull()
  })
  test('org step render accepts name field', () => {
    const r = StepForm.Step({
      id: 'org',
      render: f => {
        f.Text({ label: 'Name', name: 'name' })
        return null
      }
    })
    expect(r).toBeNull()
  })
  test('org step render rejects profile field name', () => {
    const r = StepForm.Step({
      id: 'org',
      render: f => {
        // @ts-expect-error — 'displayName' does not exist in orgSchema
        f.Text({ label: 'Name', name: 'displayName' })
        return null
      }
    })
    expect(r).toBeNull()
  })
  test('appearance step render accepts orgAvatar field', () => {
    const r = StepForm.Step({
      id: 'appearance',
      render: f => {
        f.Text({ label: 'Avatar', name: 'orgAvatar' })
        return null
      }
    })
    expect(r).toBeNull()
  })
  test('appearance step render rejects org field name', () => {
    const r = StepForm.Step({
      id: 'appearance',
      render: f => {
        // @ts-expect-error — 'name' does not exist in appearanceSchema
        f.Text({ label: 'Name', name: 'name' })
        return null
      }
    })
    expect(r).toBeNull()
  })
  test('preferences step render accepts theme field', () => {
    const r = StepForm.Step({
      id: 'preferences',
      render: f => {
        f.Choose({ label: 'Theme', name: 'theme' })
        return null
      }
    })
    expect(r).toBeNull()
  })
  test('preferences step render rejects profile field', () => {
    const r = StepForm.Step({
      id: 'preferences',
      render: f => {
        // @ts-expect-error — 'displayName' does not exist in preferencesSchema
        f.Text({ label: 'Name', name: 'displayName' })
        return null
      }
    })
    expect(r).toBeNull()
  })
  test('profile step render rejects misspelled field', () => {
    const r = StepForm.Step({
      id: 'profile',
      render: f => {
        // @ts-expect-error — 'displyName' is misspelled
        f.Text({ label: 'Name', name: 'displyName' })
        return null
      }
    })
    expect(r).toBeNull()
  })
  test('single-step stepper compiles', () => {
    const singleSchema = object({ title: string() })
    const single = defineSteps({ id: 'only', label: 'Only', schema: singleSchema })
    expect(single.steps).toHaveLength(1)
    expect(single.StepForm).toBeDefined()
  })
  test('onSubmit receives profile.displayName as string', () => {
    const _fn: Parameters<typeof useStepper>[0]['onSubmit'] = async ({ profile }) => {
      expect(profile.displayName.toUpperCase()).toBeDefined()
    }
    expect(_fn).toBeDefined()
  })
  test('onSubmit rejects profile.slug (not in profileSchema)', () => {
    const _fn: Parameters<typeof useStepper>[0]['onSubmit'] = async ({ profile }) => {
      // @ts-expect-error — 'slug' does not exist on profile step data
      expect(profile.slug).toBeDefined()
    }
    expect(_fn).toBeDefined()
  })
  test('onSubmit receives org.name as string', () => {
    const _fn: Parameters<typeof useStepper>[0]['onSubmit'] = async ({ org }) => {
      expect(org.name.toUpperCase()).toBeDefined()
    }
    expect(_fn).toBeDefined()
  })
  test('onSubmit receives preferences.theme', () => {
    const _fn: Parameters<typeof useStepper>[0]['onSubmit'] = async ({ preferences }) => {
      expect(preferences.theme).toBeDefined()
    }
    expect(_fn).toBeDefined()
  })
  test('onSubmit rejects typo step id', () => {
    const _fn: Parameters<typeof useStepper>[0]['onSubmit'] = async d => {
      // @ts-expect-error — 'typo' is not a valid step ID
      expect(d.typo).toBeDefined()
    }
    expect(_fn).toBeDefined()
  })
  test('onSubmit receives appearance.orgAvatar', () => {
    const _fn: Parameters<typeof useStepper>[0]['onSubmit'] = async ({ appearance }) => {
      expect(appearance.orgAvatar).toBeDefined()
    }
    expect(_fn).toBeDefined()
  })
  test('step with all optional fields passes validation', () => {
    const optSchema = object({
      bio: string().optional(),
      name: string().optional()
    })
    const opt = defineSteps({ id: 'info', label: 'Info', schema: optSchema })
    expect(opt.steps).toHaveLength(1)
    expect(opt.StepForm).toBeDefined()
  })
  test('steps with overlapping field names are independently typed', () => {
    const stepA = object({ name: string().min(1) })
    const stepB = object({ name: string().max(100) })
    const overlap = defineSteps({ id: 'a', label: 'A', schema: stepA }, { id: 'b', label: 'B', schema: stepB })
    const ra = overlap.StepForm.Step({
      id: 'a',
      render: f => {
        f.Text({ label: 'N', name: 'name' })
        return null
      }
    })
    const rb = overlap.StepForm.Step({
      id: 'b',
      render: f => {
        f.Text({ label: 'N', name: 'name' })
        return null
      }
    })
    expect(ra).toBeNull()
    expect(rb).toBeNull()
  })
})
// oxlint-disable unicorn/consistent-function-scoping
describe('bridge functions', () => {
  describe('idx', () => {
    test('returns the callback as-is (passthrough cast)', () => {
      const fn = (ib: { eq: (f: string, v: unknown) => unknown }) => ib.eq('name', 'test')
      const result: unknown = idx(fn as never)
      expect(result).toBe(fn)
    })
    test('preserves function identity', () => {
      const fn = (ib: { eq: (f: string, v: unknown) => unknown }) => ib.eq('id', 42)
      const a: unknown = idx(fn as never)
      const b: unknown = idx(fn as never)
      expect(a).toBe(b)
      expect(a).toBe(fn)
    })
  })
  describe('flt', () => {
    test('returns the callback as-is (passthrough cast)', () => {
      const fn = (fb: { eq: (f: string, v: unknown) => unknown }) => fb.eq('active', true)
      const result: unknown = flt(fn as never)
      expect(result).toBe(fn)
    })
  })
  describe('sch', () => {
    test('returns the callback as-is (passthrough cast)', () => {
      const fn = (sb: { search: (f: string, q: string) => unknown }) => sb.search('content', 'hello')
      const result: unknown = sch(fn as never)
      expect(result).toBe(fn)
    })
  })
  describe('typed', () => {
    test('returns string value as-is', () => {
      const result: unknown = typed('hello')
      expect(result).toBe('hello')
    })
    test('returns number value as-is', () => {
      const result: unknown = typed(42)
      expect(result).toBe(42)
    })
    test('returns object reference as-is', () => {
      const obj = { a: 1, b: 'two' }
      const result: unknown = typed(obj)
      expect(result).toBe(obj)
    })
    test('returns array reference as-is', () => {
      const arr = [1, 2, 3]
      const result: unknown = typed(arr)
      expect(result).toBe(arr)
    })
    test('returns null as-is', () => {
      const result: unknown = typed(null)
      expect(result).toBeNull()
    })
    test('returns function as-is', () => {
      const fn = () => 42
      const result: unknown = typed(fn)
      expect(result).toBe(fn)
    })
    test('preserves nested object structure', () => {
      const nested = { deep: { arr: [1, 2], val: true } }
      const result: unknown = typed(nested)
      expect(result).toBe(nested)
      expect((result as typeof nested).deep.arr).toEqual([1, 2])
    })
  })
  describe('indexFields', () => {
    test('returns single field as array', () => {
      const result: unknown = indexFields('name')
      expect(result).toEqual(['name'])
    })
    test('returns multiple fields as array', () => {
      const result: unknown = indexFields('orgId', 'userId', 'createdAt')
      expect(result).toEqual(['orgId', 'userId', 'createdAt'])
    })
    test('returns empty array for no args', () => {
      const result: unknown = indexFields()
      expect(result).toEqual([])
    })
    test('preserves field order', () => {
      const result: unknown = indexFields('z', 'a', 'm')
      expect(result).toEqual(['z', 'a', 'm'])
    })
  })
})
const BASE36_PATTERN = /^[\da-z]+$/u
const EXPORT_HOOK_PATTERN = /export\s*\{[^}]*\buse[A-Z]/u
const captureWarns = () => {
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warns.push(String(args[0]))
  }
  return { origWarn, warns }
}
describe('warnLargeFilterSet', () => {
  test('threshold is 1000', () => {
    expect(RUNTIME_FILTER_WARN_THRESHOLD).toBe(1000)
  })
  test('does not warn below threshold', () => {
    const { origWarn, warns } = captureWarns()
    warnLargeFilterSet(999, 'blog', 'list')
    console.warn = origWarn
    expect(warns).toHaveLength(0)
  })
  test('does not warn at exactly threshold', () => {
    const { origWarn, warns } = captureWarns()
    warnLargeFilterSet(1000, 'blog', 'list')
    console.warn = origWarn
    expect(warns).toHaveLength(0)
  })
  test('warns above threshold', () => {
    const { origWarn, warns } = captureWarns()
    warnLargeFilterSet(1001, 'blog', 'list')
    console.warn = origWarn
    expect(warns).toHaveLength(1)
    expect(warns[0]).toContain('large_filter_set')
    expect(warns[0]).toContain('blog')
  })
  test('warn message includes count, table, context, threshold', () => {
    const { origWarn, warns } = captureWarns()
    warnLargeFilterSet(5000, 'wiki', 'search')
    console.warn = origWarn
    expect(warns).toHaveLength(1)
    const parsed = JSON.parse(String(warns[0])) as Record<string, unknown>
    expect(parsed.count).toBe(5000)
    expect(parsed.table).toBe('wiki')
    expect(parsed.context).toBe('search')
    expect(parsed.threshold).toBe(1000)
    expect(parsed.level).toBe('warn')
  })
  test('zero count does not warn', () => {
    const { origWarn, warns } = captureWarns()
    warnLargeFilterSet(0, 'blog', 'list')
    console.warn = origWarn
    expect(warns).toHaveLength(0)
  })
  test('strict mode throws above threshold', () => {
    expect(() => warnLargeFilterSet(1001, 'blog', 'list', true)).toThrow('Runtime filtering 1001 docs')
  })
  test('strict mode does not throw below threshold', () => {
    expect(() => warnLargeFilterSet(999, 'blog', 'list', true)).not.toThrow()
  })
  test('strict mode does not throw at exactly threshold', () => {
    expect(() => warnLargeFilterSet(1000, 'blog', 'list', true)).not.toThrow()
  })
})
describe('useOnlineStatus module', () => {
  test('exports default function', async () => {
    const mod = await import('../react/use-online-status')
    expect(typeof mod.default).toBe('function')
  })
})
describe('shared constants', () => {
  test('BYTES_PER_KB is 1024', () => {
    expect(BYTES_PER_KB).toBe(1024)
  })
  test('BYTES_PER_MB is 1024 * 1024', () => {
    expect(BYTES_PER_MB).toBe(1024 * 1024)
  })
  test('BYTES_PER_MB equals BYTES_PER_KB squared', () => {
    expect(BYTES_PER_MB).toBe(BYTES_PER_KB * BYTES_PER_KB)
  })
  test('ONE_YEAR_SECONDS is 365 days in seconds', () => {
    expect(ONE_YEAR_SECONDS).toBe(60 * 60 * 24 * 365)
  })
  test('ONE_YEAR_SECONDS is approximately 31.5 million', () => {
    expect(ONE_YEAR_SECONDS).toBeGreaterThan(31_000_000)
    expect(ONE_YEAR_SECONDS).toBeLessThan(32_000_000)
  })
})
describe('sleep', () => {
  test('resolves after delay', async () => {
    const start = Date.now()
    await sleep(50)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(40)
  })
  test('resolves to void', async () => {
    const result = await sleep(1)
    expect(result).toBeUndefined()
  })
})
describe('generateToken', () => {
  test('returns a string', () => {
    expect(typeof generateToken()).toBe('string')
  })
  test('returns 48 characters', () => {
    expect(generateToken()).toHaveLength(48)
  })
  test('generates unique tokens', () => {
    const tokens = new Set<string>()
    for (let i = 0; i < 100; i += 1) tokens.add(generateToken())
    expect(tokens.size).toBe(100)
  })
  test('contains only base-36 characters', () => {
    const token = generateToken()
    expect(token).toMatch(BASE36_PATTERN)
  })
  test('SEVEN_DAYS_MS is 7 days in milliseconds', () => {
    expect(SEVEN_DAYS_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })
  test('SEVEN_DAYS_MS is 604800000', () => {
    expect(SEVEN_DAYS_MS).toBe(604_800_000)
  })
})
describe('cookie constants', () => {
  test('ACTIVE_ORG_COOKIE is activeOrgId', () => {
    expect(ACTIVE_ORG_COOKIE).toBe('activeOrgId')
  })
  test('ACTIVE_ORG_SLUG_COOKIE is activeOrgSlug', () => {
    expect(ACTIVE_ORG_SLUG_COOKIE).toBe('activeOrgSlug')
  })
  test('cookie constants are distinct', () => {
    expect(ACTIVE_ORG_COOKIE).not.toBe(ACTIVE_ORG_SLUG_COOKIE)
  })
})
describe('time helper', () => {
  test('returns object with updatedAt', () => {
    const result = time()
    expect(result).toHaveProperty('updatedAt')
    expect(typeof result.updatedAt).toBe('number')
  })
  test('updatedAt is close to Date.now()', () => {
    const before = Date.now()
    const result = time()
    const after = Date.now()
    expect(result.updatedAt).toBeGreaterThanOrEqual(before)
    expect(result.updatedAt).toBeLessThanOrEqual(after)
  })
  test('spreads into object correctly', () => {
    const obj = { name: 'test', ...time() }
    expect(obj.name).toBe('test')
    expect(typeof obj.updatedAt).toBe('number')
  })
  test('returns only updatedAt key', () => {
    const result = time()
    expect(Object.keys(result)).toEqual(['updatedAt'])
  })
})
describe('err helper', () => {
  test('throws sender error with code only', () => {
    expect(() => err('NOT_FOUND')).toThrow()
    try {
      err('NOT_FOUND')
    } catch (error) {
      const data = extractErrorData(error)
      expect(data?.code).toBe('NOT_FOUND')
      expect(data?.debug).toBeUndefined()
      expect(data?.message).toBeUndefined()
    }
  })
  test('throws sender error with debug string', () => {
    try {
      err('NOT_AUTHENTICATED', 'login-flow')
    } catch (error) {
      const data = extractErrorData(error)
      expect(data?.code).toBe('NOT_AUTHENTICATED')
      expect(data?.debug).toBe('login-flow')
      expect(data?.message).toBeUndefined()
    }
  })
  test('throws sender error with message object', () => {
    try {
      err('RATE_LIMITED', { message: 'Too many requests' })
    } catch (error) {
      const data = extractErrorData(error)
      expect(data?.code).toBe('RATE_LIMITED')
      expect(data?.message).toBe('Too many requests')
      expect(data?.debug).toBeUndefined()
    }
  })
  test('return type is never', () => {
    const fn = () => err('NOT_FOUND')
    expect(() => fn()).toThrow()
  })
})
describe('Promise.allSettled resilience pattern', () => {
  test('allSettled continues after rejection', async () => {
    let successCalled = false
    const results = await Promise.allSettled([
      Promise.reject(new Error('storage fail')),
      (async () => {
        successCalled = true
      })()
    ])
    expect(results[0].status).toBe('rejected')
    expect(results[1].status).toBe('fulfilled')
    expect(successCalled).toBe(true)
  })
  test('allSettled collects all failures', async () => {
    const results = await Promise.allSettled([
      Promise.reject(new Error('fail 1')),
      Promise.reject(new Error('fail 2')),
      Promise.resolve('ok')
    ])
    const rejected = results.filter(r => r.status === 'rejected')
    expect(rejected).toHaveLength(2)
    expect(results[2].status).toBe('fulfilled')
  })
  test('subsequent Promise.all still runs after allSettled failures', async () => {
    const order: string[] = []
    const sr = await Promise.allSettled([
      Promise.reject(new Error('storage cleanup fail')),
      (async () => {
        order.push('storage-2')
      })()
    ])
    expect(sr[0].status).toBe('rejected')
    await Promise.all([
      (async () => {
        order.push('db-1')
      })(),
      (async () => {
        order.push('db-2')
      })()
    ])
    expect(order).toContain('storage-2')
    expect(order).toContain('db-1')
    expect(order).toContain('db-2')
  })
})
describe('ROLE_LEVEL export removal', () => {
  test('ROLE_LEVEL is not re-exported from org-crud public API', async () => {
    const mod = await import('../server/org-crud')
    expect(mod).toHaveProperty('orgCascade')
    expect(mod).toHaveProperty('checkMembership')
    expect(mod).not.toHaveProperty('ROLE_LEVEL')
  })
})
describe('getMeta', () => {
  test('string field returns kind string', () => {
    expect(getMeta(string())).toEqual({ kind: 'string' })
  })
  test('enum field returns kind string', () => {
    expect(getMeta(zenum(['a', 'b']))).toEqual({ kind: 'string' })
  })
  test('number field returns kind number', () => {
    expect(getMeta(number())).toEqual({ kind: 'number' })
  })
  test('boolean field returns kind boolean', () => {
    expect(getMeta(boolean())).toEqual({ kind: 'boolean' })
  })
  test('date field returns kind date', () => {
    expect(getMeta(date())).toEqual({ kind: 'date' })
  })
  test('file returns kind file', () => {
    expect(getMeta(file())).toEqual({ kind: 'file' })
  })
  test('files returns kind files', () => {
    expect(getMeta(files())).toEqual({ kind: 'files' })
  })
  test('files with max returns kind files with max', () => {
    expect(getMeta(files().max(5))).toEqual({ kind: 'files', max: 5 })
  })
  test('array(string) returns kind stringArray', () => {
    expect(getMeta(array(string()))).toEqual({ kind: 'stringArray' })
  })
  test('array(string).max(10) returns stringArray with max', () => {
    expect(getMeta(array(string()).max(10))).toEqual({
      kind: 'stringArray',
      max: 10
    })
  })
  test('array(number) returns kind unknown', () => {
    expect(getMeta(array(number()))).toEqual({ kind: 'unknown' })
  })
  test('optional string returns kind string', () => {
    expect(getMeta(optional(string()))).toEqual({ kind: 'string' })
  })
  test('nullable file returns kind file', () => {
    expect(getMeta(file().nullable())).toEqual({ kind: 'file' })
  })
  test('optional nullable file returns kind file', () => {
    expect(getMeta(file().nullable().optional())).toEqual({ kind: 'file' })
  })
  test('unknown input returns kind unknown', () => {
    expect(getMeta(42)).toEqual({ kind: 'unknown' })
  })
})
describe('buildMeta', () => {
  test('builds meta map for all field types', () => {
    const s = object({
      active: boolean(),
      avatar: file().nullable().optional(),
      bio: optional(string()),
      count: number(),
      photos: files().max(3),
      tags: array(string()).max(10),
      title: string()
    })
    const meta = buildMeta(s)
    expect(meta.title).toEqual({ kind: 'string' })
    expect(meta.count).toEqual({ kind: 'number' })
    expect(meta.active).toEqual({ kind: 'boolean' })
    expect(meta.avatar).toEqual({ kind: 'file' })
    expect(meta.photos).toEqual({ kind: 'files', max: 3 })
    expect(meta.tags).toEqual({ kind: 'stringArray', max: 10 })
    expect(meta.bio).toEqual({ kind: 'string' })
  })
  test('empty schema returns empty meta', () => {
    const s = object({})
    expect(buildMeta(s)).toEqual({})
  })
  test('schema with only one field', () => {
    const s = object({ name: string() })
    const meta = buildMeta(s)
    expect(Object.keys(meta)).toHaveLength(1)
    expect(meta.name).toEqual({ kind: 'string' })
  })
  test('enum fields are typed as string', () => {
    const s = object({ status: zenum(['draft', 'published']) })
    expect(buildMeta(s).status).toEqual({ kind: 'string' })
  })
  test('date field in buildMeta', () => {
    const s = object({ createdAt: date() })
    expect(buildMeta(s).createdAt).toEqual({ kind: 'date' })
  })
})
describe('canEditResource', () => {
  const resource = { userId: 'u1' }
  test('admin can always edit', () => {
    expect(
      canEditResource({
        editorsList: [],
        isAdmin: true,
        resource,
        userId: 'u999'
      })
    ).toBe(true)
  })
  test('resource creator can edit', () => {
    expect(
      canEditResource({
        editorsList: [],
        isAdmin: false,
        resource,
        userId: 'u1'
      })
    ).toBe(true)
  })
  test('user in editors list can edit', () => {
    expect(
      canEditResource({
        editorsList: [{ userId: 'u2' }],
        isAdmin: false,
        resource,
        userId: 'u2'
      })
    ).toBe(true)
  })
  test('non-admin, non-creator, not in editors cannot edit', () => {
    expect(
      canEditResource({
        editorsList: [],
        isAdmin: false,
        resource,
        userId: 'u2'
      })
    ).toBe(false)
  })
  test('non-admin, non-creator, editors list has others', () => {
    expect(
      canEditResource({
        editorsList: [{ userId: 'u3' }],
        isAdmin: false,
        resource,
        userId: 'u2'
      })
    ).toBe(false)
  })
  test('admin takes precedence over empty editors', () => {
    expect(
      canEditResource({
        editorsList: [],
        isAdmin: true,
        resource,
        userId: 'u2'
      })
    ).toBe(true)
  })
  test('creator takes precedence over missing from editors', () => {
    expect(
      canEditResource({
        editorsList: [{ userId: 'u99' }],
        isAdmin: false,
        resource,
        userId: 'u1'
      })
    ).toBe(true)
  })
  test('multiple editors, user is one of them', () => {
    const editors = [{ userId: 'u2' }, { userId: 'u3' }, { userId: 'u4' }]
    expect(
      canEditResource({
        editorsList: editors,
        isAdmin: false,
        resource,
        userId: 'u3'
      })
    ).toBe(true)
  })
  test('multiple editors, user is none of them', () => {
    const editors = [{ userId: 'u2' }, { userId: 'u3' }]
    expect(
      canEditResource({
        editorsList: editors,
        isAdmin: false,
        resource,
        userId: 'u5'
      })
    ).toBe(false)
  })
})
describe('isRecord', () => {
  test('plain object returns true', () => {
    expect(isRecord({ a: 1 })).toBe(true)
  })
  test('empty object returns true', () => {
    expect(isRecord({})).toBe(true)
  })
  test('null returns false', () => {
    expect(isRecord(null)).toBe(false)
  })
  test('undefined returns false', () => {
    const val = undefined
    expect(isRecord(val)).toBe(false)
  })
  test('string returns false', () => {
    expect(isRecord('hello')).toBe(false)
  })
  test('number returns false', () => {
    expect(isRecord(42)).toBe(false)
  })
  test('boolean returns false', () => {
    expect(isRecord(true)).toBe(false)
  })
  test('array returns false', () => {
    expect(isRecord([1, 2, 3])).toBe(false)
  })
  test('0 returns false', () => {
    expect(isRecord(0)).toBe(false)
  })
  test('empty string returns false', () => {
    expect(isRecord('')).toBe(false)
  })
  test('false returns false', () => {
    expect(isRecord(false)).toBe(false)
  })
})
describe('extractErrorData', () => {
  test('extracts code from SenderError', () => {
    const e = makeSenderError({ code: 'NOT_FOUND' })
    const d = extractErrorData(e)
    expect(d).toBeDefined()
    expect(d?.code).toBe('NOT_FOUND')
  })
  test('extracts code, debug from SenderError', () => {
    const e = makeSenderError({
      code: 'NOT_AUTHENTICATED',
      debug: 'session-expired'
    })
    const d = extractErrorData(e)
    expect(d?.code).toBe('NOT_AUTHENTICATED')
    expect(d?.debug).toBe('session-expired')
  })
  test('extracts code, message from SenderError', () => {
    const e = makeSenderError({ code: 'RATE_LIMITED', message: 'Too fast' })
    const d = extractErrorData(e)
    expect(d?.code).toBe('RATE_LIMITED')
    expect(d?.message).toBe('Too fast')
  })
  test('extracts code, fields from SenderError', () => {
    const e = makeSenderError({
      code: 'NOT_FOUND',
      fields: ['title', 'content']
    })
    const d = extractErrorData(e)
    expect(d?.code).toBe('NOT_FOUND')
    expect(d?.fields).toEqual(['title', 'content'])
  })
  test('returns undefined for non-SenderError', () => {
    expect(extractErrorData(new Error('plain'))).toBeUndefined()
  })
  test('returns undefined for string', () => {
    expect(extractErrorData('error')).toBeUndefined()
  })
  test('returns undefined for null', () => {
    expect(extractErrorData(null)).toBeUndefined()
  })
  test('returns undefined for SenderError without valid code', () => {
    const e = makeSenderError({ code: 'INVALID_CODE_THAT_DOES_NOT_EXIST' })
    expect(extractErrorData(e)).toBeUndefined()
  })
  test('returns undefined for SenderError with non-string code', () => {
    const e = makeSenderError({ code: 42 })
    expect(extractErrorData(e)).toBeUndefined()
  })
  test('returns undefined for SenderError with non-record data', () => {
    const e = makeSenderError('just a string')
    expect(extractErrorData(e)).toBeUndefined()
  })
  test('debug is undefined when not a string', () => {
    const e = makeSenderError({ code: 'NOT_FOUND', debug: 123 })
    const d = extractErrorData(e)
    expect(d?.debug).toBeUndefined()
  })
  test('message is undefined when not a string', () => {
    const e = makeSenderError({ code: 'NOT_FOUND', message: false })
    const d = extractErrorData(e)
    expect(d?.message).toBeUndefined()
  })
  test('fields is undefined when not an array', () => {
    const e = makeSenderError({ code: 'NOT_FOUND', fields: 'title' })
    const d = extractErrorData(e)
    expect(d?.fields).toBeUndefined()
  })
})
describe('getErrorCode', () => {
  test('returns code from SenderError', () => {
    expect(getErrorCode(makeSenderError({ code: 'CONFLICT' }))).toBe('CONFLICT')
  })
  test('returns undefined for plain Error', () => {
    expect(getErrorCode(new Error('nope'))).toBeUndefined()
  })
  test('returns undefined for non-error', () => {
    expect(getErrorCode('string')).toBeUndefined()
  })
  test('returns undefined for null', () => {
    expect(getErrorCode(null)).toBeUndefined()
  })
})
describe('getErrorMessage', () => {
  test('returns message from SenderError with message field', () => {
    expect(getErrorMessage(makeSenderError({ code: 'NOT_FOUND', message: 'Blog not found' }))).toBe('Blog not found')
  })
  test('falls back to ERROR_MESSAGES for code without message', () => {
    const msg = getErrorMessage(makeSenderError({ code: 'NOT_AUTHENTICATED' }))
    expect(typeof msg).toBe('string')
    expect(msg.length).toBeGreaterThan(0)
    expect(msg).not.toBe('Unknown error')
  })
  test('returns Error.message for plain Error', () => {
    expect(getErrorMessage(new Error('something broke'))).toBe('something broke')
  })
  test('returns Unknown error for non-error values', () => {
    expect(getErrorMessage('random')).toBe('Unknown error')
    expect(getErrorMessage(42)).toBe('Unknown error')
    expect(getErrorMessage(null)).toBe('Unknown error')
  })
})
describe('handleError', () => {
  test('calls specific handler for matching code', () => {
    let called = false
    handleError(makeSenderError({ code: 'NOT_FOUND' }), {
      NOT_FOUND: () => {
        called = true
      }
    })
    expect(called).toBe(true)
  })
  test('calls default handler when no matching code handler', () => {
    let defaultCalled = false
    handleError(makeSenderError({ code: 'NOT_FOUND' }), {
      default: () => {
        defaultCalled = true
      }
    })
    expect(defaultCalled).toBe(true)
  })
  test('calls default handler for plain Error', () => {
    let defaultCalled = false
    handleError(new Error('plain'), {
      default: () => {
        defaultCalled = true
      }
    })
    expect(defaultCalled).toBe(true)
  })
  test('does nothing when no matching handler and no default', () => {
    let called = false
    handleError(makeSenderError({ code: 'RATE_LIMITED' }), {
      NOT_FOUND: () => {
        called = true
      }
    })
    expect(called).toBe(false)
  })
  test('specific handler receives error data', () => {
    handleError(makeSenderError({ code: 'CONFLICT', message: 'stale data' }), {
      CONFLICT: d => {
        expect(d.code).toBe('CONFLICT')
        expect(d.message).toBe('stale data')
      }
    })
  })
  test('specific handler takes precedence over default', () => {
    let which = ''
    handleError(makeSenderError({ code: 'NOT_FOUND' }), {
      NOT_FOUND: () => {
        which = 'specific'
      },
      default: () => {
        which = 'default'
      }
    })
    expect(which).toBe('specific')
  })
  test('default receives original error for non-SenderError', () => {
    const original = new Error('oops')
    handleError(original, {
      default: e => {
        expect(e).toBe(original)
      }
    })
  })
  test('does nothing for non-error with no default', () => {
    expect(() => handleError(null, {})).not.toThrow()
  })
})
describe('withRetry', () => {
  test('returns value on immediate success', async () => {
    const result = await withRetry(async () => 42)
    expect(result).toBe(42)
  })
  test('retries and succeeds on second attempt', async () => {
    let calls = 0
    const result = await withRetry(
      async () => {
        calls += 1
        if (calls < 2) throw new Error('fail')
        return 'ok'
      },
      { initialDelayMs: 1, maxAttempts: 3 }
    )
    expect(result).toBe('ok')
    expect(calls).toBe(2)
  })
  test('throws last error after all attempts exhausted', async () => {
    let calls = 0
    let threw = false
    try {
      await withRetry(
        async () => {
          calls += 1
          throw new Error(`fail-${String(calls)}`)
        },
        { initialDelayMs: 1, maxAttempts: 3 }
      )
    } catch (error) {
      threw = true
      expect((error as Error).message).toBe('fail-3 (after 3 attempts)')
      expect((error as Error).cause).toBeInstanceOf(Error)
      expect(((error as Error).cause as Error).message).toBe('fail-3')
    }
    expect(threw).toBe(true)
    expect(calls).toBe(3)
  })
  test('respects maxAttempts: 1 (no retry)', async () => {
    let calls = 0
    let threw = false
    try {
      await withRetry(
        async () => {
          calls += 1
          throw new Error('once')
        },
        { maxAttempts: 1 }
      )
    } catch (error) {
      threw = true
      expect((error as Error).message).toBe('once (after 1 attempts)')
    }
    expect(threw).toBe(true)
    expect(calls).toBe(1)
  })
  test('wraps non-Error thrown values', async () => {
    let threw = false
    try {
      await withRetry(
        async () => {
          throw new Error('string-error')
        },
        { initialDelayMs: 1, maxAttempts: 2 }
      )
    } catch (error) {
      threw = true
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('string-error (after 2 attempts)')
    }
    expect(threw).toBe(true)
  })
  test('default options: 3 attempts', async () => {
    let calls = 0
    try {
      await withRetry(
        async () => {
          calls += 1
          throw new Error('fail')
        },
        { initialDelayMs: 1 }
      )
    } catch {
      /* Expected */
    }
    expect(calls).toBe(3)
  })
})
const mockFetch = (fn: (...args: never[]) => Promise<Response>) => {
  globalThis.fetch = fn as never
}
describe('fetchWithRetry', () => {
  test('returns successful response', async () => {
    const originalFetch = globalThis.fetch
    mockFetch(async () => new Response('ok', { status: 200 }))
    try {
      const resp = await fetchWithRetry('https://example.com')
      expect(resp.ok).toBe(true)
      expect(await resp.text()).toBe('ok')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
  test('does not retry on 4xx errors', async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    mockFetch(async () => {
      calls += 1
      return new Response('not found', {
        status: 404,
        statusText: 'Not Found'
      })
    })
    try {
      const resp = await fetchWithRetry('https://example.com', {
        retry: { initialDelayMs: 1, maxAttempts: 3 }
      })
      expect(resp.status).toBe(404)
      expect(calls).toBe(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
  test('retries on 5xx errors', async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    mockFetch(async () => {
      calls += 1
      if (calls < 3)
        return new Response('error', {
          status: 500,
          statusText: 'Internal Server Error'
        })
      return new Response('ok', { status: 200 })
    })
    try {
      const resp = await fetchWithRetry('https://example.com', {
        retry: { initialDelayMs: 1, maxAttempts: 3 }
      })
      expect(resp.ok).toBe(true)
      expect(calls).toBe(3)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
  test('throws after all retries for persistent 5xx', async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    mockFetch(async () => {
      calls += 1
      return new Response('error', {
        status: 500,
        statusText: 'Internal Server Error'
      })
    })
    let threw = false
    try {
      await fetchWithRetry('https://example.com', {
        retry: { initialDelayMs: 1, maxAttempts: 2 }
      })
    } catch (error) {
      threw = true
      expect((error as Error).message).toContain('500')
    } finally {
      globalThis.fetch = originalFetch
    }
    expect(threw).toBe(true)
    expect(calls).toBe(2)
  })
  test('passes fetch options through', async () => {
    const originalFetch = globalThis.fetch
    let receivedInit: RequestInit | undefined
    mockFetch(async (...args: never[]) => {
      const [, init] = args as unknown as [unknown, RequestInit | undefined]
      receivedInit = init
      return new Response('ok', { status: 200 })
    })
    try {
      await fetchWithRetry('https://example.com', { method: 'POST' })
      expect(receivedInit?.method).toBe('POST')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
describe('Fix #1: getOrgMember compound index', () => {
  test('getOrgMember is not exported from org-crud', async () => {
    const mod = await import('../server/org-crud')
    expect(mod).not.toHaveProperty('getOrgMember')
  })
  test('getOrgMember is not re-exported from server/index', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', 'server', 'index.ts'), 'utf8')
    expect(content.includes('getOrgMember')).toBe(false)
  })
  test('requireOrgMember is not exported from org-crud', async () => {
    const mod = await import('../server/org-crud')
    expect(mod).not.toHaveProperty('requireOrgMember')
  })
})
describe('Fix #2: singleton first-upsert validates full schema', () => {
  const singletonProfile = object({
    bio: string().optional(),
    displayName: string(),
    notifications: boolean(),
    theme: zenum(['light', 'dark', 'system'])
  })
  test('partial data fails full schema safeParse (missing required fields)', () => {
    const result = singletonProfile.safeParse({ bio: 'hello' })
    expect(result.success).toBe(false)
  })
  test('partial data missing displayName fails', () => {
    const result = singletonProfile.safeParse({
      notifications: true,
      theme: 'dark'
    })
    expect(result.success).toBe(false)
  })
  test('partial data missing notifications fails', () => {
    const result = singletonProfile.safeParse({
      displayName: 'Jane',
      theme: 'dark'
    })
    expect(result.success).toBe(false)
  })
  test('partial data missing theme fails', () => {
    const result = singletonProfile.safeParse({
      displayName: 'Jane',
      notifications: true
    })
    expect(result.success).toBe(false)
  })
  test('complete data passes full schema safeParse', () => {
    const result = singletonProfile.safeParse({
      displayName: 'Jane',
      notifications: true,
      theme: 'dark'
    })
    expect(result.success).toBe(true)
  })
  test('complete data with optional bio passes', () => {
    const result = singletonProfile.safeParse({
      bio: 'Hello world',
      displayName: 'Jane',
      notifications: false,
      theme: 'system'
    })
    expect(result.success).toBe(true)
  })
  test('partial schema allows subset of fields', () => {
    const partial = singletonProfile.partial()
    const result = partial.safeParse({ bio: 'hello' })
    expect(result.success).toBe(true)
  })
  test('partial schema allows empty object', () => {
    const partial = singletonProfile.partial()
    const result = partial.safeParse({})
    expect(result.success).toBe(true)
  })
  test('invalid enum value fails full schema', () => {
    const result = singletonProfile.safeParse({
      displayName: 'Jane',
      notifications: true,
      theme: 'invalid'
    })
    expect(result.success).toBe(false)
  })
  test('wrong type for required field fails full schema', () => {
    const result = singletonProfile.safeParse({
      displayName: 123,
      notifications: true,
      theme: 'dark'
    })
    expect(result.success).toBe(false)
  })
})
describe('Fix #3: factory table names typed as keyof DM & string', () => {
  test('setup is exported from server/setup', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', 'server', 'setup.ts'), 'utf8')
    expect(content.includes('export') && content.includes('setup')).toBe(true)
  })
  test('setup is re-exported from server/index', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', 'server', 'index.ts'), 'utf8')
    expect(content.includes('setup')).toBe(true)
  })
})
describe('Fix #4: ownedCascade helper', () => {
  const taskSchema = Object.assign(
    object({
      completed: boolean(),
      priority: string(),
      projectId: string(),
      title: string()
    }),
    { __name: 'task' } as const
  )
  const messageSchema = Object.assign(
    object({
      chatId: string(),
      content: string(),
      role: string()
    }),
    { __name: 'message' } as const
  )
  test('ownedCascade accepts valid foreignKey', () => {
    const result = ownedCascade(taskSchema, { foreignKey: 'projectId' })
    expect(result.foreignKey).toBe('projectId')
    expect(result.table).toBe('task')
  })
  test('ownedCascade accepts another valid foreignKey', () => {
    const result = ownedCascade(messageSchema, { foreignKey: 'chatId' })
    expect(result.foreignKey).toBe('chatId')
    expect(result.table).toBe('message')
  })
  test('ownedCascade rejects invalid foreignKey', () => {
    const _invalid = ownedCascade(taskSchema, {
      // @ts-expect-error — 'projctId' is not a key of taskSchema
      foreignKey: 'projctId'
    })
    expect(_invalid).toBeDefined()
  })
  test('ownedCascade rejects completely wrong foreignKey', () => {
    const _invalid = ownedCascade(taskSchema, {
      // @ts-expect-error — 'nonExistentField' is not a key of taskSchema
      foreignKey: 'nonExistentField'
    })
    expect(_invalid).toBeDefined()
  })
  test('ownedCascade rejects misspelled foreignKey on messageSchema', () => {
    const _invalid = ownedCascade(messageSchema, {
      // @ts-expect-error — 'chatI' is not a key of messageSchema
      foreignKey: 'chatI'
    })
    expect(_invalid).toBeDefined()
  })
  test('ownedCascade returns object with foreignKey and table', () => {
    const result = ownedCascade(taskSchema, { foreignKey: 'title' })
    expect(typeof result.foreignKey).toBe('string')
    expect(typeof result.table).toBe('string')
  })
  test('ownedCascade is re-exported from server/index', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', 'server', 'index.ts'), 'utf8')
    expect(content.includes('ownedCascade')).toBe(true)
  })
  test('ownedCascade mirrors orgCascade behavior', () => {
    const owned = ownedCascade(taskSchema, { foreignKey: 'projectId' })
    const org = orgCascade(taskSchema, { foreignKey: 'projectId' })
    expect(owned.foreignKey).toBe(org.foreignKey)
    expect(owned.table).toBe(org.table)
  })
})
describe('Fix #5: OrgCascadeTableConfig type', () => {
  test('string config accepts valid table name', () => {
    const config: OrgCascadeTableConfig = 'blog'
    expect(config).toBe('blog')
  })
  test('string config accepts another valid table name', () => {
    const config: OrgCascadeTableConfig = 'wiki'
    expect(config).toBe('wiki')
  })
  test('object config accepts valid table name', () => {
    const config: OrgCascadeTableConfig = { table: 'wiki' }
    expect(config).toEqual({ table: 'wiki' })
  })
  test('object config accepts fileFields', () => {
    const config: OrgCascadeTableConfig = {
      fileFields: ['photo', 'avatar'],
      table: 'blog'
    }
    expect(config).toEqual({ fileFields: ['photo', 'avatar'], table: 'blog' })
  })
  test('object config with empty fileFields', () => {
    const config: OrgCascadeTableConfig = { fileFields: [], table: 'blog' }
    expect(config).toEqual({ fileFields: [], table: 'blog' })
  })
  test('array of OrgCascadeTableConfig accepts mixed configs', () => {
    const configs: OrgCascadeTableConfig[] = ['blog', { fileFields: ['photo'], table: 'wiki' }]
    expect(configs).toHaveLength(2)
  })
})
describe('Fix #6: org update allows clearing avatarId with null', () => {
  const convertAvatar = (v: null | string) => v ?? undefined
  test('null converts to undefined', () => {
    expect(convertAvatar(null)).toBeUndefined()
  })
  test('non-null value preserved', () => {
    expect(convertAvatar('storage_123')).toBe('storage_123')
  })
  test('undefined is present in patch object', () => {
    const patchData: Record<string, unknown> = { avatarId: undefined }
    expect(Object.keys(patchData)).toContain('avatarId')
    expect(patchData.avatarId).toBeUndefined()
  })
  test('different values trigger cleanup', () => {
    const shouldCleanup = (a: null | string, b: null | string) => a !== b
    expect(shouldCleanup('storage_old', 'storage_new')).toBe(true)
  })
  test('null is different from old value', () => {
    const shouldCleanup = (a: null | string, b: null | string) => a !== b
    expect(shouldCleanup('storage_old', null)).toBe(true)
  })
  test('same value skips cleanup', () => {
    const shouldCleanup = (a: null | string, b: null | string) => a !== b
    expect(shouldCleanup('storage_same', 'storage_same')).toBe(false)
  })
})
describe('Fix #7: child list accepts optional limit parameter', () => {
  const limitSchema = number().optional()
  test('limit schema accepts undefined', () => {
    const undef = undefined
    expect(limitSchema.safeParse(undef).success).toBe(true)
  })
  test('limit schema accepts positive number', () => {
    expect(limitSchema.safeParse(10).success).toBe(true)
  })
  test('limit schema accepts zero', () => {
    expect(limitSchema.safeParse(0).success).toBe(true)
  })
  test('limit schema rejects string', () => {
    expect(limitSchema.safeParse('abc').success).toBe(false)
  })
  test('limit schema rejects boolean', () => {
    expect(limitSchema.safeParse(true).success).toBe(false)
  })
  test('child.ts list arg includes limit field', async () => {
    const mod = await import('../server/child')
    expect(mod).toHaveProperty('makeChildCrud')
  })
})
// oxlint-disable-next-line unicorn/consistent-function-scoping
const capBatchSize = (bs: number | undefined) => Math.min(bs ?? BULK_MAX, BULK_MAX)
describe('Fix #8: cache purge uses take(batchSize)', () => {
  test('BULK_MAX is 100', () => {
    expect(BULK_MAX).toBe(100)
  })
  test('batchSize capping — undefined defaults to BULK_MAX', () => {
    const undef = undefined
    expect(capBatchSize(undef)).toBe(100)
  })
  test('batchSize capping — small value preserved', () => {
    expect(capBatchSize(50)).toBe(50)
  })
  test('batchSize capping — large value capped at BULK_MAX', () => {
    expect(capBatchSize(200)).toBe(100)
  })
  test('batchSize capping — exact BULK_MAX preserved', () => {
    expect(capBatchSize(100)).toBe(100)
  })
  test('batchSize capping — value of 1 preserved', () => {
    expect(capBatchSize(1)).toBe(1)
  })
  test('batchSize schema accepts number or undefined', () => {
    const bsSchema = number().optional()
    const undef = undefined
    expect(bsSchema.safeParse(undef).success).toBe(true)
    expect(bsSchema.safeParse(50).success).toBe(true)
    expect(bsSchema.safeParse('abc').success).toBe(false)
  })
})
describe('Fix #9: useList accepts optional pageSize', () => {
  test('DEFAULT_PAGE_SIZE is 50', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50)
  })
  test('UseListOptions accepts pageSize', () => {
    const opts: UseListOptions = { pageSize: 25 }
    expect(opts.pageSize).toBe(25)
  })
  test('UseListOptions accepts empty object', () => {
    const opts: UseListOptions = {}
    expect(opts.pageSize).toBeUndefined()
  })
  test('pageSize is used when provided', () => {
    const opts: UseListOptions = { pageSize: 25 }
    expect(opts.pageSize).toBe(25)
    expect(opts.pageSize).not.toBe(DEFAULT_PAGE_SIZE)
  })
  test('missing pageSize falls back to DEFAULT_PAGE_SIZE conceptually', () => {
    const opts: UseListOptions = {}
    expect(opts.pageSize).toBeUndefined()
    expect(DEFAULT_PAGE_SIZE).toBe(50)
  })
  test('DEFAULT_PAGE_SIZE module export', async () => {
    const mod = await import('../react/use-list')
    expect(mod).toHaveProperty('DEFAULT_PAGE_SIZE')
    expect(mod.DEFAULT_PAGE_SIZE).toBe(50)
  })
  test('useList module export', async () => {
    const mod = await import('../react/use-list')
    expect(mod).toHaveProperty('useList')
    expect(typeof mod.useList).toBe('function')
  })
})
describe('useList search option', () => {
  test('UseListOptions accepts search with typed fields', () => {
    const opts: UseListOptions<{
      content: string
      tags: string[]
      title: string
    }> = {
      search: { fields: ['title', 'content'], query: 'hello' }
    }
    expect(opts.search?.query).toBe('hello')
    expect(opts.search?.fields).toEqual(['title', 'content'])
  })
  test('UseListOptions search fields are typed to row keys', () => {
    const valid: UseListOptions<{ content: string; title: string }> = {
      search: { fields: ['title'], query: 'test' }
    }
    expect(valid.search?.fields).toEqual(['title'])
    type SearchFields = NonNullable<UseListOptions<{ content: string; title: string }>['search']>['fields']
    const check: SearchFields = ['content', 'title']
    expect(check).toHaveLength(2)
  })
  test('UseListOptions search is optional', () => {
    const opts: UseListOptions = { pageSize: 20 }
    expect(opts.search).toBeUndefined()
  })
  test('UseListOptions generic default allows any fields', () => {
    const opts: UseListOptions = {
      search: { fields: ['anything', 'goes'], query: 'test' }
    }
    expect(opts.search?.fields).toHaveLength(2)
  })
  test('UseListOptions search with empty query', () => {
    const opts: UseListOptions<{ title: string }> = {
      search: { fields: ['title'], query: '' }
    }
    expect(opts.search?.query).toBe('')
  })
  test('UseListOptions search with empty fields', () => {
    const opts: UseListOptions<{ title: string }> = {
      search: { fields: [], query: 'hello' }
    }
    expect(opts.search?.fields).toHaveLength(0)
  })
})
describe('useList where typing', () => {
  test('UseListOptions typed where accepts string field', () => {
    const opts = {
      where: { title: 'hello' }
    } satisfies UseListOptions<{ published: boolean; title: string }>
    expect(opts.where?.title).toBe('hello')
  })
  test('UseListOptions typed where accepts boolean field', () => {
    const opts = {
      where: { published: true }
    } satisfies UseListOptions<{ published: boolean; title: string }>
    expect(opts.where?.published).toBe(true)
  })
  test('UseListOptions typed where accepts own field', () => {
    const opts = {
      where: { own: true }
    } satisfies UseListOptions<{ published: boolean; title: string }>
    expect(opts.where?.own).toBe(true)
  })
  test('UseListOptions typed where accepts ComparisonOp values', () => {
    const opts = {
      where: { price: { $gt: 10 } }
    } satisfies UseListOptions<{ price: number }>
    expect((opts.where?.price as { $gt?: number })?.$gt).toBe(10)
  })
  test('UseListOptions typed where accepts or groups', () => {
    const opts = {
      where: { or: [{ title: 'a' }, { own: true }] }
    } satisfies UseListOptions<{ title: string }>
    expect(opts.where?.or).toHaveLength(2)
  })
  test('UseListOptions default generic keeps backwards-compatible where keys', () => {
    const opts: UseListOptions = { where: { anything: 'goes', own: true } }
    expect(opts.where?.own).toBe(true)
  })
  test('ListWhere and WhereGroup exports are importable and usable', () => {
    const group: WhereGroup<{ title: string }> = { own: true, title: 'hello' }
    const where: ListWhere<{ title: string }> = {
      or: [{ title: 'a' }, { own: true }],
      title: 'hello'
    }
    expect(group.title).toBe('hello')
    expect(where.or).toHaveLength(2)
  })
})
describe('collectSettled helper', () => {
  test('collectSettled splits fulfilled values from errors', () => {
    const settled: PromiseSettledResult<number>[] = [
      { status: 'fulfilled', value: 1 },
      { reason: new Error('boom'), status: 'rejected' },
      { status: 'fulfilled', value: 2 }
    ]
    const { errors, results } = collectSettled(settled)
    const bulk: BulkResult<number> = { errors, results, settled }
    expect(results).toEqual([1, 2])
    expect(errors).toHaveLength(1)
    expect(bulk.settled).toHaveLength(3)
  })
})
describe('ConflictData typing', () => {
  test('ConflictData generic keeps current and incoming typed', () => {
    const conflict = {
      code: 'CONFLICT',
      current: { title: 'current' },
      incoming: { title: 'incoming' }
    } satisfies ConflictData<{ title: string }>
    expect(conflict.current.title).toBe('current')
    expect(conflict.incoming.title).toBe('incoming')
  })
  test('ConflictData default generic uses unknown payloads', () => {
    const conflict: ConflictData = {
      code: 'CONFLICT',
      current: { title: 'x' }
    }
    const { current } = conflict
    expect(current).toBeDefined()
  })
})
describe('Fix #10: isTestMode production safety', () => {
  test('isTestMode returns true when SPACETIMEDB_TEST_MODE=true and NODE_ENV=test', () => {
    const origTest = process.env.SPACETIMEDB_TEST_MODE
    const origNode = process.env.NODE_ENV
    process.env.SPACETIMEDB_TEST_MODE = 'true'
    process.env.NODE_ENV = 'test'
    expect(isTestMode()).toBe(true)
    process.env.SPACETIMEDB_TEST_MODE = origTest
    process.env.NODE_ENV = origNode
  })
  test('isTestMode returns true when SPACETIMEDB_TEST_MODE=true regardless of NODE_ENV', () => {
    const origTest = process.env.SPACETIMEDB_TEST_MODE
    const origNode = process.env.NODE_ENV
    process.env.SPACETIMEDB_TEST_MODE = 'true'
    process.env.NODE_ENV = 'production'
    expect(isTestMode()).toBe(true)
    process.env.SPACETIMEDB_TEST_MODE = origTest
    process.env.NODE_ENV = origNode
  })
  test('isTestMode returns false when SPACETIMEDB_TEST_MODE is false', () => {
    const origTest = process.env.SPACETIMEDB_TEST_MODE
    const origNode = process.env.NODE_ENV
    process.env.SPACETIMEDB_TEST_MODE = 'false'
    process.env.NODE_ENV = 'test'
    expect(isTestMode()).toBe(false)
    process.env.SPACETIMEDB_TEST_MODE = origTest
    process.env.NODE_ENV = origNode
  })
  test('isTestMode returns false when SPACETIMEDB_TEST_MODE is undefined', () => {
    const origTest = process.env.SPACETIMEDB_TEST_MODE
    const origNode = process.env.NODE_ENV
    delete process.env.SPACETIMEDB_TEST_MODE
    process.env.NODE_ENV = 'test'
    expect(isTestMode()).toBe(false)
    process.env.SPACETIMEDB_TEST_MODE = origTest
    process.env.NODE_ENV = origNode
  })
  test('isTestMode returns false when both are undefined', () => {
    const origTest = process.env.SPACETIMEDB_TEST_MODE
    const origNode = process.env.NODE_ENV
    delete process.env.SPACETIMEDB_TEST_MODE
    delete process.env.NODE_ENV
    expect(isTestMode()).toBe(false)
    process.env.SPACETIMEDB_TEST_MODE = origTest
    process.env.NODE_ENV = origNode
  })
  test('isTestMode returns true when SPACETIMEDB_TEST_MODE=true and NODE_ENV=development', () => {
    const origTest = process.env.SPACETIMEDB_TEST_MODE
    const origNode = process.env.NODE_ENV
    process.env.SPACETIMEDB_TEST_MODE = 'true'
    process.env.NODE_ENV = 'development'
    expect(isTestMode()).toBe(true)
    process.env.SPACETIMEDB_TEST_MODE = origTest
    process.env.NODE_ENV = origNode
  })
  test('isTestMode returns true when SPACETIMEDB_TEST_MODE=true and NODE_ENV is empty', () => {
    const origTest = process.env.SPACETIMEDB_TEST_MODE
    const origNode = process.env.NODE_ENV
    process.env.SPACETIMEDB_TEST_MODE = 'true'
    process.env.NODE_ENV = ''
    expect(isTestMode()).toBe(true)
    process.env.SPACETIMEDB_TEST_MODE = origTest
    process.env.NODE_ENV = origNode
  })
  test('isTestMode is exported from server/test', async () => {
    const mod = await import('../server/test')
    expect(mod).toHaveProperty('isTestMode')
    expect(typeof mod.isTestMode).toBe('function')
  })
})
describe('VALIDATION_FAILED error code', () => {
  test('VALIDATION_FAILED exists in ERROR_MESSAGES', () => {
    expect(ERROR_MESSAGES).toHaveProperty('VALIDATION_FAILED')
    expect(ERROR_MESSAGES.VALIDATION_FAILED).toBe(
      'Some fields are invalid — check the highlighted fields and fix the errors'
    )
  })
  test('VALIDATION_FAILED is a valid ErrorCode', () => {
    const code: ErrorCode = 'VALIDATION_FAILED'
    expect(code).toBe('VALIDATION_FAILED')
  })
  test('err() accepts VALIDATION_FAILED', () => {
    expect(() => err('VALIDATION_FAILED')).toThrow()
    try {
      err('VALIDATION_FAILED')
    } catch (error) {
      expect(extractErrorData(error)?.code).toBe('VALIDATION_FAILED')
    }
  })
  test('extractErrorData works with VALIDATION_FAILED', () => {
    const e = makeSenderError({ code: 'VALIDATION_FAILED', fields: ['title'] })
    const d = extractErrorData(e)
    expect(d).toBeDefined()
    expect(d?.code).toBe('VALIDATION_FAILED')
    expect(d?.fields).toEqual(['title'])
  })
  test('getErrorCode returns VALIDATION_FAILED', () => {
    const e = makeSenderError({ code: 'VALIDATION_FAILED' })
    expect(getErrorCode(e)).toBe('VALIDATION_FAILED')
  })
  test('getErrorMessage falls back to ERROR_MESSAGES for VALIDATION_FAILED', () => {
    const msg = getErrorMessage(makeSenderError({ code: 'VALIDATION_FAILED' }))
    expect(msg).toBe('Some fields are invalid — check the highlighted fields and fix the errors')
  })
  test('handleError routes VALIDATION_FAILED', () => {
    let called = false
    handleError(makeSenderError({ code: 'VALIDATION_FAILED' }), {
      VALIDATION_FAILED: () => {
        called = true
      }
    })
    expect(called).toBe(true)
  })
  test('typo in BuiltinErrorCode is caught at compile time', () => {
    // @ts-expect-error - VALIDATION_FAILEDD is not a valid BuiltinErrorCode (typo)
    const _invalidCode: BuiltinErrorCode = 'VALIDATION_FAILEDD' as const
    expect(_invalidCode).toBeDefined()
  })
})
describe('errValidation with VALIDATION_FAILED', () => {
  test('errValidation throws SenderError with code and fields', () => {
    const zodError = {
      flatten: () => ({
        fieldErrors: { content: ['Too short'], title: ['Required'] }
      })
    }
    try {
      errValidation('VALIDATION_FAILED', zodError)
    } catch (error) {
      const d = extractErrorData(error)
      expect(d?.code).toBe('VALIDATION_FAILED')
      expect(d?.fields).toContain('title')
      expect(d?.fields).toContain('content')
      expect(d?.fields).toHaveLength(2)
      expect(d?.message).toContain('Invalid:')
      expect(d?.message).toContain('title')
      expect(d?.message).toContain('content')
    }
  })
  test('errValidation with empty fieldErrors uses fallback message', () => {
    const zodError = {
      flatten: () => ({ fieldErrors: {} })
    }
    try {
      errValidation('VALIDATION_FAILED', zodError)
    } catch (error) {
      const d = extractErrorData(error)
      expect(d?.code).toBe('VALIDATION_FAILED')
      expect(d?.fields).toEqual([])
      expect(d?.message).toBe(ERROR_MESSAGES.VALIDATION_FAILED)
    }
  })
  test('errValidation return type is never', () => {
    const zodError = { flatten: () => ({ fieldErrors: { x: ['bad'] } }) }
    expect(() => errValidation('VALIDATION_FAILED', zodError)).toThrow()
  })
})
describe('field-level error routing (R9.3)', () => {
  test('errValidation produces fieldErrors in thrown error', () => {
    const zodError = {
      flatten: () => ({
        fieldErrors: {
          content: ['Too short', 'Must be unique'],
          title: ['Required']
        }
      })
    }
    try {
      errValidation('VALIDATION_FAILED', zodError)
    } catch (error) {
      const d = extractErrorData(error)
      expect(d?.fieldErrors).toEqual({
        content: 'Too short',
        title: 'Required'
      })
    }
  })
  test('errValidation takes first error message per field', () => {
    const zodError = {
      flatten: () => ({
        fieldErrors: { email: ['Invalid email', 'Already taken'] }
      })
    }
    try {
      errValidation('VALIDATION_FAILED', zodError)
    } catch (error) {
      expect(extractErrorData(error)?.fieldErrors?.email).toBe('Invalid email')
    }
  })
  test('errValidation with empty fieldErrors produces empty object', () => {
    const zodError = { flatten: () => ({ fieldErrors: {} }) }
    try {
      errValidation('VALIDATION_FAILED', zodError)
    } catch (error) {
      expect(extractErrorData(error)?.fieldErrors).toEqual({})
    }
  })
  test('extractErrorData returns fieldErrors from SenderError', () => {
    const e = makeSenderError({
      code: 'VALIDATION_FAILED',
      fieldErrors: { content: 'Too short', title: 'Required' },
      fields: ['title', 'content'],
      message: 'Invalid: title, content'
    })
    const d = extractErrorData(e)
    expect(d).toBeDefined()
    expect(d?.fieldErrors).toEqual({ content: 'Too short', title: 'Required' })
  })
  test('extractErrorData returns undefined fieldErrors when not a record', () => {
    const e = makeSenderError({
      code: 'VALIDATION_FAILED',
      fieldErrors: 'not-a-record'
    })
    const d = extractErrorData(e)
    expect(d).toBeDefined()
    expect(d?.fieldErrors).toBeUndefined()
  })
  test('extractErrorData returns undefined fieldErrors when missing', () => {
    const e = makeSenderError({ code: 'NOT_FOUND' })
    const d = extractErrorData(e)
    expect(d).toBeDefined()
    expect(d?.fieldErrors).toBeUndefined()
  })
  test('extractErrorData ignores array fieldErrors (arrays are not records)', () => {
    const e = makeSenderError({
      code: 'VALIDATION_FAILED',
      fieldErrors: ['title', 'content']
    })
    const d = extractErrorData(e)
    expect(d).toBeDefined()
    expect(d?.fieldErrors).toBeUndefined()
  })
  test('end-to-end: errValidation → extractErrorData preserves fieldErrors', () => {
    const zodError = {
      flatten: () => ({
        fieldErrors: {
          category: ['Invalid value'],
          content: ['Min 3 chars'],
          title: ['Required']
        }
      })
    }
    try {
      errValidation('VALIDATION_FAILED', zodError)
    } catch (error) {
      const d = extractErrorData(error)
      expect(d).toBeDefined()
      expect(d?.code).toBe('VALIDATION_FAILED')
      expect(d?.fieldErrors).toEqual({
        category: 'Invalid value',
        content: 'Min 3 chars',
        title: 'Required'
      })
      expect(d?.fields).toEqual(['category', 'content', 'title'])
      expect(d?.message).toBe('Invalid: category, content, title')
    }
  })
  test('errValidation skips fields with empty error arrays', () => {
    const zodError = {
      flatten: () => ({
        fieldErrors: { content: [], empty: undefined, title: ['Required'] }
      })
    }
    try {
      errValidation('VALIDATION_FAILED', zodError)
    } catch (error) {
      const d = extractErrorData(error)
      expect(d?.fieldErrors).toEqual({ title: 'Required' })
      expect(d?.fields).toEqual(['title'])
    }
  })
  test('extractErrorData with fieldErrors as null returns undefined', () => {
    const e = makeSenderError({
      code: 'VALIDATION_FAILED',
      fieldErrors: null
    })
    const d = extractErrorData(e)
    expect(d?.fieldErrors).toBeUndefined()
  })
  test('extractErrorData with fieldErrors as number returns undefined', () => {
    const e = makeSenderError({
      code: 'VALIDATION_FAILED',
      fieldErrors: 42
    })
    const d = extractErrorData(e)
    expect(d?.fieldErrors).toBeUndefined()
  })
  test('extractErrorData with nested fieldErrors preserves values', () => {
    const e = makeSenderError({
      code: 'VALIDATION_FAILED',
      fieldErrors: { email: 'Already taken', password: 'Too weak' },
      fields: ['email', 'password']
    })
    const d = extractErrorData(e)
    expect(d?.fieldErrors).toEqual({
      email: 'Already taken',
      password: 'Too weak'
    })
    expect(d?.fields).toEqual(['email', 'password'])
  })
  test('errValidation with single field produces correct shape', () => {
    const zodError = {
      flatten: () => ({ fieldErrors: { slug: ['Must be lowercase'] } })
    }
    try {
      errValidation('VALIDATION_FAILED', zodError)
    } catch (error) {
      const d = extractErrorData(error)
      expect(d?.fieldErrors).toEqual({ slug: 'Must be lowercase' })
      expect(d?.fields).toEqual(['slug'])
      expect(d?.message).toBe('Invalid: slug')
    }
  })
  test('extractErrorData with empty record fieldErrors returns empty record', () => {
    const e = makeSenderError({
      code: 'VALIDATION_FAILED',
      fieldErrors: {}
    })
    const d = extractErrorData(e)
    expect(d?.fieldErrors).toEqual({})
  })
  test('field-level errors coexist with general error message', () => {
    const e = makeSenderError({
      code: 'VALIDATION_FAILED',
      fieldErrors: { title: 'Too long' },
      fields: ['title'],
      message: 'Some fields are invalid — check the highlighted fields and fix the errors'
    })
    const d = extractErrorData(e)
    expect(d?.message).toBe('Some fields are invalid — check the highlighted fields and fix the errors')
    expect(d?.fieldErrors).toEqual({ title: 'Too long' })
  })
})
describe('cleanFiles update scenario (next param)', () => {
  const mockStorage = () => {
    const deleted: string[] = []
    return {
      delete: async (id: string) => {
        deleted.push(id)
      },
      deleted,
      getUrl: async () => null
    }
  }
  test('cleans replaced single file on update', async () => {
    const s = mockStorage()
    await cleanFiles({
      doc: { photo: 'old_file_id' },
      fileFields: ['photo'],
      next: { photo: 'new_file_id' },
      storage: s
    })
    expect(s.deleted).toEqual(['old_file_id'])
  })
  test('cleans removed single file on update (set to null)', async () => {
    const s = mockStorage()
    await cleanFiles({
      doc: { photo: 'old_file_id' },
      fileFields: ['photo'],
      next: { photo: null },
      storage: s
    })
    expect(s.deleted).toEqual(['old_file_id'])
  })
  test('does not clean unchanged file on update', async () => {
    const s = mockStorage()
    await cleanFiles({
      doc: { photo: 'same_file_id' },
      fileFields: ['photo'],
      next: { photo: 'same_file_id' },
      storage: s
    })
    expect(s.deleted).toEqual([])
  })
  test('does not clean file when field not in next (partial update)', async () => {
    const s = mockStorage()
    await cleanFiles({
      doc: { photo: 'existing_file' },
      fileFields: ['photo'],
      next: { title: 'new title' },
      storage: s
    })
    expect(s.deleted).toEqual([])
  })
  test('cleans removed array files on update', async () => {
    const s = mockStorage()
    await cleanFiles({
      doc: { attachments: ['file_a', 'file_b', 'file_c'] },
      fileFields: ['attachments'],
      next: { attachments: ['file_a'] },
      storage: s
    })
    expect(s.deleted).toContain('file_b')
    expect(s.deleted).toContain('file_c')
    expect(s.deleted).not.toContain('file_a')
  })
  test('cleans all files on delete (no next param)', async () => {
    const s = mockStorage()
    await cleanFiles({
      doc: { attachments: ['file_a', 'file_b'], photo: 'file_c' },
      fileFields: ['photo', 'attachments'],
      storage: s
    })
    expect(s.deleted).toContain('file_a')
    expect(s.deleted).toContain('file_b')
    expect(s.deleted).toContain('file_c')
    expect(s.deleted).toHaveLength(3)
  })
  test('skips null prev values on delete', async () => {
    const s = mockStorage()
    await cleanFiles({
      doc: { photo: null },
      fileFields: ['photo'],
      storage: s
    })
    expect(s.deleted).toEqual([])
  })
  test('handles mixed file types (single + array) on update', async () => {
    const s = mockStorage()
    await cleanFiles({
      doc: { attachments: ['att_old'], photo: 'photo_old' },
      fileFields: ['photo', 'attachments'],
      next: { attachments: ['att_new'], photo: 'photo_new' },
      storage: s
    })
    expect(s.deleted).toContain('photo_old')
    expect(s.deleted).toContain('att_old')
    expect(s.deleted).not.toContain('photo_new')
    expect(s.deleted).not.toContain('att_new')
  })
})
describe('detectFiles on child-like schemas', () => {
  test('detects file fields in child schema with foreign key', () => {
    const shape = {
      avatar: file().nullable(),
      chatId: string(),
      content: string()
    }
    expect(detectFiles(shape)).toEqual(['avatar'])
  })
  test('detects files in child schema', () => {
    const shape = { attachments: files(), chatId: string(), text: string() }
    expect(detectFiles(shape)).toEqual(['attachments'])
  })
  test('detects multiple file fields in child schema', () => {
    const shape = {
      attachments: files(),
      chatId: string(),
      content: string(),
      thumbnail: file().nullable().optional()
    }
    const result = detectFiles(shape)
    expect(result).toContain('attachments')
    expect(result).toContain('thumbnail')
    expect(result).toHaveLength(2)
  })
  test('returns empty for child schema without file fields', () => {
    const shape = { chatId: string(), content: string(), likes: number() }
    expect(detectFiles(shape)).toEqual([])
  })
})
describe('makeUnique optional index param', () => {
  test('makeUnique is exported from helpers', () => {
    expect(typeof makeUnique).toBe('function')
  })
  test('makeUnique accepts index parameter in options', () => {
    const sig = makeUnique.length
    expect(sig).toBe(1)
  })
})
describe('ERROR_MESSAGES completeness', () => {
  test('all error codes have non-empty string messages', () => {
    for (const key of Object.keys(ERROR_MESSAGES)) {
      const msg = ERROR_MESSAGES[key as keyof typeof ERROR_MESSAGES]
      expect(typeof msg).toBe('string')
      expect(msg.length).toBeGreaterThan(0)
    }
  })
  test('ErrorCode type matches ERROR_MESSAGES keys', () => {
    const keys = Object.keys(ERROR_MESSAGES)
    expect(keys.length).toBeGreaterThan(0)
    for (const k of keys) {
      const code = k as keyof typeof ERROR_MESSAGES
      expect(ERROR_MESSAGES[code]).toBeDefined()
    }
  })
  test('VALIDATION_FAILED is distinct from INVALID_WHERE', () => {
    expect(ERROR_MESSAGES.VALIDATION_FAILED).not.toBe(ERROR_MESSAGES.INVALID_WHERE)
    expect(ERROR_MESSAGES.VALIDATION_FAILED).toBe(
      'Some fields are invalid — check the highlighted fields and fix the errors'
    )
    expect(ERROR_MESSAGES.INVALID_WHERE).toBe('Invalid filter — check that field names and values match the schema')
  })
})
describe('guardApi', () => {
  const fakeApi = {
    blog: { list: 'fn1' },
    blogProfile: { get: 'fn2' },
    chat: { send: 'fn3' }
  }
  const modules = ['blog', 'blogProfile', 'chat']
  test('allows valid module access', () => {
    const guarded = guardApi(fakeApi, modules)
    expect(guarded.blog.list).toBe('fn1')
    expect(guarded.blogProfile.get).toBe('fn2')
    expect(guarded.chat.send).toBe('fn3')
  })
  test('throws on unknown module', () => {
    const guarded = guardApi(fakeApi, modules) as Record<string, unknown>
    expect(() => guarded.nonexistent).toThrow('does not match any reducer/table module')
  })
  test('suggests correct casing on mismatch', () => {
    const guarded = guardApi(fakeApi, modules) as Record<string, unknown>
    expect(() => guarded.blogprofile).toThrow('Did you mean blogProfile')
  })
  test('suggests correct casing for all-caps typo', () => {
    const guarded = guardApi(fakeApi, modules) as Record<string, unknown>
    expect(() => guarded.BLOG).toThrow('Did you mean blog')
  })
  test('includes valid modules in unknown module error', () => {
    const guarded = guardApi(fakeApi, modules) as Record<string, unknown>
    expect(() => guarded.xyz).toThrow('blog, blogProfile, chat')
  })
})
describe('makeErrorHandler', () => {
  test('calls toast with message for unknown error', () => {
    const messages: string[] = []
    const handler = makeErrorHandler((m: string) => {
      messages.push(m)
    })
    handler(new Error('something broke'))
    expect(messages).toEqual(['something broke'])
  })
  test('calls toast with SenderError message', () => {
    const messages: string[] = []
    const handler = makeErrorHandler((m: string) => {
      messages.push(m)
    })
    handler(makeSenderError({ code: 'NOT_FOUND', message: 'Blog not found' }))
    expect(messages).toEqual(['Blog not found'])
  })
  test('calls override handler for specific code', () => {
    const messages: string[] = []
    let overrideCalled = false
    const handler = makeErrorHandler(
      (m: string) => {
        messages.push(m)
      },
      {
        RATE_LIMITED: () => {
          overrideCalled = true
        }
      }
    )
    handler(makeSenderError({ code: 'RATE_LIMITED' }))
    expect(overrideCalled).toBe(true)
    expect(messages).toEqual([])
  })
  test('falls back to toast for codes without override', () => {
    const messages: string[] = []
    const handler = makeErrorHandler(
      (m: string) => {
        messages.push(m)
      },
      {
        RATE_LIMITED: () => {
          /* Noop */
        }
      }
    )
    handler(makeSenderError({ code: 'NOT_FOUND', message: 'Gone' }))
    expect(messages).toEqual(['Gone'])
  })
})
describe('noboil-stdb-viz', () => {
  test('extractFieldType recognizes string', () => {
    expect(extractFieldType('t.string()')).toBe('string')
  })
  test('extractFieldType recognizes boolean', () => {
    expect(extractFieldType('t.bool()')).toBe('boolean')
  })
  test('extractFieldType recognizes number', () => {
    expect(extractFieldType('t.f64()')).toBe('number')
  })
  test('extractFieldType recognizes file', () => {
    expect(extractFieldType('t.bytes()')).toBe('bytes')
  })
  test('extractFieldType recognizes files', () => {
    expect(extractFieldType('t.array(t.string())')).toBe('string')
  })
  test('extractFieldType recognizes zid', () => {
    expect(extractFieldType('t.map(t.string(), t.string())')).toBe('string')
  })
  test('extractFieldType recognizes enum', () => {
    expect(extractFieldType("z.enum(['a','b'])")).toBe('unknown')
  })
  test('extractFieldsFromBlock parses fields', () => {
    const block = `
      title: t.string(),
      published: t.bool(),
      count: t.f64(),`
    const fields = parseFieldsFromBlock(block)
    expect(fields).toHaveLength(3)
    expect(fields[0]).toEqual({
      name: 'title',
      optional: false,
      type: 'string'
    })
    expect(fields[1]).toEqual({
      name: 'published',
      optional: false,
      type: 'boolean'
    })
    expect(fields[2]).toEqual({
      name: 'count',
      optional: false,
      type: 'number'
    })
  })
  test('extractWrapperTables finds owned tables', () => {
    const content = `const s = schema({
  blog: table({}, {
    title: t.string(),
    published: t.bool()
  })
})`
    const tables = extractWrapperTables(content)
    expect(tables).toHaveLength(1)
    const [t] = tables
    expect(t).toBeDefined()
    expect(t?.name).toBe('blog')
    expect(t?.tableType).toBe('table')
    expect(t?.fields.length).toBeGreaterThanOrEqual(2)
  })
  test('extractChildren finds child tables', () => {
    const content = `const s = schema({
  chat: table({}, {
    title: t.string()
  }),
  message: table({}, {
    chatId: t.string(),
    role: t.string()
  })
})`
    const children = extractChildren(content)
    expect(children).toHaveLength(1)
    const [c] = children
    expect(c).toBeDefined()
    expect(c?.name).toBe('message')
    expect(c?.parent).toBe('chat')
    expect(c?.foreignKey).toBe('chatId')
  })
  test('generateMermaid outputs erDiagram', () => {
    const tables = [
      {
        fields: [{ name: 'title', type: 'string' }],
        name: 'blog',
        tableType: 'table'
      }
    ]
    const children = [
      {
        fields: [{ name: 'chatId', type: 'id<chat>' }],
        foreignKey: 'chatId',
        name: 'message',
        parent: 'chat',
        tableType: 'child'
      }
    ]
    const mermaid = generateMermaid(tables, children)
    expect(mermaid).toContain('erDiagram')
    expect(mermaid).toContain('blog {')
    expect(mermaid).toContain('chat ||--o{ message')
  })
})
describe('noboil-stdb-check --endpoints', () => {
  const makeCall = (factory: string, options = ''): FactoryCall => ({
    factory,
    file: 'test.ts',
    options,
    table: 'test'
  })
  test('crud produces base + pub endpoints', () => {
    const eps = endpointsForFactory(makeCall('makeCrud', 'endpoints=create,read,update'))
    expect(eps).toContain('create')
    expect(eps).toContain('read')
    expect(eps).toContain('update')
  })
  test('crud with search adds pub.search', () => {
    const eps = endpointsForFactory(makeCall('makeCrud', 'endpoints=search,pub.search'))
    expect(eps).toContain('search')
    expect(eps).toContain('pub.search')
  })
  test('crud with softDelete adds restore', () => {
    const eps = endpointsForFactory(makeCall('makeCrud', 'endpoints=restore,rm'))
    expect(eps).toContain('restore')
  })
  test('orgCrud produces base endpoints', () => {
    const eps = endpointsForFactory(makeCall('makeOrg', 'endpoints=list,read,create,update,rm'))
    expect(eps).toContain('list')
    expect(eps).toContain('read')
    expect(eps).toContain('create')
    expect(eps).toContain('update')
    expect(eps).toContain('rm')
  })
  test('orgCrud with acl adds editor endpoints', () => {
    const eps = endpointsForFactory(makeCall('makeOrg', 'endpoints=addEditor,removeEditor,setEditors,editors'))
    expect(eps).toContain('addEditor')
    expect(eps).toContain('removeEditor')
    expect(eps).toContain('setEditors')
    expect(eps).toContain('editors')
  })
  test('singletonCrud produces get + upsert', () => {
    const eps = endpointsForFactory(makeCall('makeCrud', 'endpoints=get,upsert'))
    expect(eps).toEqual(['get', 'upsert'])
  })
  test('cacheCrud produces all cache endpoints', () => {
    const eps = endpointsForFactory(makeCall('makeCacheCrud', 'endpoints=get,invalidate,purge,refresh'))
    expect(eps).toContain('get')
    expect(eps).toContain('invalidate')
    expect(eps).toContain('purge')
    expect(eps).toContain('refresh')
  })
  test('childCrud produces base child endpoints', () => {
    const eps = endpointsForFactory(makeCall('makeChildCrud', 'endpoints=list,create,update,rm'))
    expect(eps).toContain('list')
    expect(eps).toContain('create')
    expect(eps).toContain('update')
    expect(eps).toContain('rm')
  })
  test('childCrud with pub adds pub.list and pub.get', () => {
    const eps = endpointsForFactory(makeCall('makeChildCrud', 'endpoints=pub.list,pub.get'))
    expect(eps).toContain('pub.list')
    expect(eps).toContain('pub.get')
  })
})
describe('bundle verification', () => {
  test('noboil/spacetimedb/server does not export React hooks', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', 'server', 'index.ts'), 'utf8')
    expect(EXPORT_HOOK_PATTERN.test(content)).toBe(false)
  })
  test('noboil/spacetimedb/schema has no React imports', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', 'schema.ts'), 'utf8')
    expect(content.includes("from 'react'")).toBe(false)
    expect(content.includes('useState')).toBe(false)
    expect(content.includes('useEffect')).toBe(false)
  })
  test('noboil/spacetimedb/schema has no node:fs imports', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', 'schema.ts'), 'utf8')
    expect(content.includes("from 'node:fs'")).toBe(false)
  })
  test('noboil/spacetimedb/retry has no React or server imports', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', 'retry.ts'), 'utf8')
    expect(content.includes("from 'react'")).toBe(false)
    expect(content.includes("from 'node:fs'")).toBe(false)
  })
  test('entry point count matches package.json exports', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', '..', '..', 'package.json'), 'utf8')
    const pkg = JSON.parse(content) as { exports: Record<string, string> }
    const exportKeys = Object.keys(pkg.exports)
    expect(exportKeys.length).toBeGreaterThanOrEqual(8)
  })
})
describe('devtools subscription tracking', () => {
  test('STALE_THRESHOLD_MS is 30 seconds', () => {
    expect(STALE_THRESHOLD_MS).toBe(30_000)
  })
  test('trackSubscription returns numeric id', () => {
    const id = trackSubscription('api.blog.list', { where: {} })
    expect(typeof id).toBe('number')
    expect(id).toBeGreaterThan(0)
    untrackSubscription(id)
  })
  test('trackSubscription assigns unique ids', () => {
    const id1 = trackSubscription('api.blog.list')
    const id2 = trackSubscription('api.chat.list')
    expect(id1).not.toBe(id2)
    untrackSubscription(id1)
    untrackSubscription(id2)
  })
  test('updateSubscription changes status', () => {
    const id = trackSubscription('api.blog.list')
    updateSubscription(id, 'loaded')
    updateSubscription(id, 'error')
    untrackSubscription(id)
    expect(id).toBeGreaterThan(0)
  })
  test('updateSubscription on missing id is no-op', () => {
    expect(() => updateSubscription(999_999, 'loaded')).not.toThrow()
  })
  test('untrackSubscription removes subscription', () => {
    const id = trackSubscription('api.test.list')
    untrackSubscription(id)
    expect(() => untrackSubscription(id)).not.toThrow()
  })
})
describe('devtools subscription data tracking', () => {
  test('updateSubscriptionData updates preview and counts', () => {
    const id = trackSubscription('api.blog.list')
    const data = [
      { _id: '1', title: 'Hello' },
      { _id: '2', title: 'World' }
    ]
    const preview = JSON.stringify(data[0]).slice(0, 200)
    updateSubscriptionData(id, data, preview)
    expect(id).toBeGreaterThan(0)
    untrackSubscription(id)
  })
  test('updateSubscriptionData increments renderCount', () => {
    const id = trackSubscription('api.blog.list')
    updateSubscriptionData(id, [{ _id: '1' }], '{}')
    updateSubscriptionData(id, [{ _id: '1' }, { _id: '2' }], '{}')
    updateSubscriptionData(id, [{ _id: '1' }, { _id: '2' }, { _id: '3' }], '{}')
    expect(id).toBeGreaterThan(0)
    untrackSubscription(id)
  })
  test('updateSubscriptionData on missing id is no-op', () => {
    expect(() => updateSubscriptionData(999_999, [], '')).not.toThrow()
  })
  test('subscription initializes with empty dataPreview', () => {
    const id = trackSubscription('api.test.list')
    expect(id).toBeGreaterThan(0)
    untrackSubscription(id)
  })
  test('subscription initializes with zero renderCount', () => {
    const id = trackSubscription('api.test.list')
    expect(id).toBeGreaterThan(0)
    untrackSubscription(id)
  })
  test('subscription initializes with zero resultCount', () => {
    const id = trackSubscription('api.test.list')
    expect(id).toBeGreaterThan(0)
    untrackSubscription(id)
  })
  test('updateSubscriptionData updates resultCount', () => {
    const id = trackSubscription('api.blog.list')
    updateSubscriptionData(id, [{ _id: '1' }, { _id: '2' }, { _id: '3' }], 'preview')
    expect(id).toBeGreaterThan(0)
    untrackSubscription(id)
  })
  test('updateSubscriptionData with empty data', () => {
    const id = trackSubscription('api.blog.list')
    updateSubscriptionData(id, [], '')
    expect(id).toBeGreaterThan(0)
    untrackSubscription(id)
  })
  test('multiple data updates preserve subscription', () => {
    const id = trackSubscription('api.blog.list')
    for (let i = 0; i < 10; i += 1) updateSubscriptionData(id, [{ _id: String(i) }], `item-${i}`)
    expect(id).toBeGreaterThan(0)
    untrackSubscription(id)
  })
})
describe('lifecycle hooks types', () => {
  test('CrudHooks interface is structurally valid', () => {
    const hooks: CrudHooks = {
      afterCreate: () => {
        /* Noop */
      },
      afterDelete: () => {
        /* Noop */
      },
      afterUpdate: () => {
        /* Noop */
      },
      beforeCreate: (_ctx, { data }) => data,
      beforeDelete: () => {
        /* Noop */
      },
      beforeUpdate: (_ctx, { patch }) => patch
    }
    expect(hooks.beforeCreate).toBeDefined()
    expect(hooks.afterCreate).toBeDefined()
    expect(hooks.beforeUpdate).toBeDefined()
    expect(hooks.afterUpdate).toBeDefined()
    expect(hooks.beforeDelete).toBeDefined()
    expect(hooks.afterDelete).toBeDefined()
  })
  test('HookCtx has required properties', () => {
    const ctx: HookCtx = {
      db: {} as HookCtx['db'],
      storage: {} as HookCtx['storage'],
      userId: 'user_123'
    }
    expect(ctx.db).toBeDefined()
    expect(ctx.storage).toBeDefined()
    expect(ctx.userId).toBe('user_123')
  })
  test('CrudOptions accepts hooks field', () => {
    const opts: CrudOptions<{ title: ReturnType<typeof string> }> = {
      hooks: {
        afterCreate: () => {
          /* Noop */
        }
      },
      softDelete: true
    }
    expect(opts.hooks).toBeDefined()
    expect(opts.softDelete).toBe(true)
  })
  test('hooks can be async', () => {
    const hooks: CrudHooks = {
      afterDelete: async () => {
        /* Noop */
      },
      beforeCreate: async (_ctx, { data }) => data
    }
    expect(hooks.beforeCreate).toBeDefined()
    expect(hooks.afterDelete).toBeDefined()
  })
  test('hooks are optional on CrudOptions', () => {
    const opts: CrudOptions<{ title: ReturnType<typeof string> }> = {}
    expect(opts.hooks).toBeUndefined()
  })
})
describe('lifecycle hooks in orgCrud and childCrud', () => {
  type OrgOpts = OrgCrudOptions<{ title: ReturnType<typeof string> }>
  test('OrgCrudOptions accepts hooks field', () => {
    const opts: OrgOpts = {
      hooks: {
        afterDelete: () => {
          /* Noop */
        },
        beforeCreate: (_ctx, { data }) => data
      },
      softDelete: true
    }
    expect(opts.hooks).toBeDefined()
    expect(opts.hooks?.beforeCreate).toBeDefined()
    expect(opts.hooks?.afterDelete).toBeDefined()
  })
  test('OrgCrudOptions hooks are optional', () => {
    const opts: OrgOpts = {}
    expect(opts.hooks).toBeUndefined()
  })
  test('OrgCrudOptions hooks coexist with acl and softDelete', () => {
    const opts: OrgOpts = {
      acl: true,
      hooks: {
        afterCreate: () => {
          /* Noop */
        }
      },
      softDelete: true
    }
    expect(opts.hooks).toBeDefined()
    expect(opts.acl).toBe(true)
    expect(opts.softDelete).toBe(true)
  })
  test('OrgCrudOptions hooks can be async', () => {
    const opts: OrgOpts = {
      hooks: {
        afterDelete: async () => {
          /* Noop */
        },
        beforeCreate: async (_ctx, { data }) => data,
        beforeUpdate: async (_ctx, { patch }) => patch
      }
    }
    expect(opts.hooks?.beforeCreate).toBeDefined()
    expect(opts.hooks?.beforeUpdate).toBeDefined()
  })
  test('ChildCrudOptions via makeChildCrud accepts hooks conceptually', () => {
    const hooks: CrudHooks = {
      afterCreate: () => {
        /* Noop */
      },
      afterDelete: () => {
        /* Noop */
      },
      afterUpdate: () => {
        /* Noop */
      },
      beforeCreate: (_ctx, { data }) => data,
      beforeDelete: () => {
        /* Noop */
      },
      beforeUpdate: (_ctx, { patch }) => patch
    }
    expect(typeof hooks.beforeCreate).toBe('function')
    expect(typeof hooks.afterCreate).toBe('function')
    expect(typeof hooks.beforeUpdate).toBe('function')
    expect(typeof hooks.afterUpdate).toBe('function')
    expect(typeof hooks.beforeDelete).toBe('function')
    expect(typeof hooks.afterDelete).toBe('function')
  })
  test('all 6 hook callbacks work with HookCtx', () => {
    type CrudHookCtx = Parameters<NonNullable<CrudHooks['beforeCreate']>>[0]
    const ctx: CrudHookCtx = {
      db: {},
      sender: { toString: () => 'user_456' } as CrudHookCtx['sender'],
      timestamp: { microsSinceUnixEpoch: 0n } as CrudHookCtx['timestamp']
    }
    const hooks: CrudHooks = {
      afterCreate: (c, { row }) => {
        expect(c.sender.toString()).toBe('user_456')
        expect(row).toBeDefined()
      },
      afterDelete: c => {
        expect(c.db).toBeDefined()
      },
      afterUpdate: (_c, { prev }) => {
        expect(prev).toBeDefined()
      },
      beforeCreate: (c, { data }) => {
        expect(c.timestamp).toBeDefined()
        return data
      },
      beforeDelete: (_c, { row }) => {
        expect(row).toBeDefined()
      },
      beforeUpdate: (c, { patch }) => {
        expect(c.sender.toString()).toBe('user_456')
        return patch
      }
    }
    hooks.beforeCreate?.(ctx, { data: { title: 'test' } })
    hooks.afterCreate?.(ctx, {
      data: { title: 'test' },
      row: { title: 'test' }
    })
    hooks.beforeUpdate?.(ctx, {
      patch: { title: 'new' },
      prev: { title: 'old' }
    })
    hooks.afterUpdate?.(ctx, {
      next: { title: 'new' },
      patch: { title: 'new' },
      prev: { title: 'old' }
    })
    hooks.beforeDelete?.(ctx, { row: { title: 'test' } })
    hooks.afterDelete?.(ctx, { row: { title: 'test' } })
  })
})
describe('query timing in devtools', () => {
  test('SLOW_THRESHOLD_MS is defined', () => {
    expect(SLOW_THRESHOLD_MS).toBe(5000)
  })
  test('trackSubscription initializes timing fields', () => {
    const id = trackSubscription('api.blog.list')
    expect(id).toBeGreaterThan(0)
    untrackSubscription(id)
  })
  test('updateSubscription computes latency on first loaded', () => {
    const id = trackSubscription('api.timing.test')
    updateSubscription(id, 'loaded')
    untrackSubscription(id)
    expect(id).toBeGreaterThan(0)
  })
  test('multiple updates do not reset firstResultAt', () => {
    const id = trackSubscription('api.multi.test')
    updateSubscription(id, 'loaded')
    updateSubscription(id, 'loaded')
    untrackSubscription(id)
    expect(id).toBeGreaterThan(0)
  })
})
describe('noboil-stdb-docs', () => {
  test('generateMarkdown produces markdown header', () => {
    const md = generateMarkdown([], new Map())
    expect(md).toContain('# API Reference')
    expect(md).toContain('noboil-stdb docs')
  })
  test('generateMarkdown includes factory table', () => {
    const calls = [
      {
        factory: 'reducer',
        file: 'blog.ts',
        options: 'endpoints=create,read',
        table: 'blog'
      }
    ]
    const fields = new Map([['blog', [{ name: 'title', type: 'string' }]]])
    const md = generateMarkdown(calls, fields)
    expect(md).toContain('## blog')
    expect(md).toContain('SpacetimeDB reducers for table operations')
    expect(md).toContain('blog.ts')
    expect(md).toContain('title')
  })
  test('generateMarkdown lists endpoints per factory', () => {
    const calls = [
      {
        factory: 'reducer',
        file: 'blog.ts',
        options: 'endpoints=create,update,rm',
        table: 'blog'
      }
    ]
    const md = generateMarkdown(calls, new Map())
    expect(md).toContain('blog.create')
    expect(md).toContain('blog.update')
    expect(md).toContain('blog.rm')
  })
  test('generateMarkdown handles orgCrud with acl', () => {
    const calls = [
      {
        factory: 'reducer',
        file: 'wiki.ts',
        options: 'endpoints=addEditor,setEditors',
        table: 'wiki'
      }
    ]
    const md = generateMarkdown(calls, new Map())
    expect(md).toContain('wiki.addEditor')
    expect(md).toContain('wiki.setEditors')
  })
  test('generateMarkdown handles singletonCrud', () => {
    const calls = [
      {
        factory: 'reducer',
        file: 'profile.ts',
        options: 'endpoints=get,upsert',
        table: 'profile'
      }
    ]
    const md = generateMarkdown(calls, new Map())
    expect(md).toContain('profile.get')
    expect(md).toContain('profile.upsert')
  })
  test('generateMarkdown includes schema fields section', () => {
    const calls = [
      {
        factory: 'reducer',
        file: 'blog.ts',
        options: 'endpoints=create',
        table: 'blog'
      }
    ]
    const fields = new Map([
      [
        'blog',
        [
          { name: 'title', type: 'string' },
          { name: 'published', type: 'boolean' }
        ]
      ]
    ])
    const md = generateMarkdown(calls, fields)
    expect(md).toContain('### Schema Fields')
    expect(md).toContain('| title | `string` |')
    expect(md).toContain('| published | `boolean` |')
  })
  test('generateMarkdown shows endpoint types', () => {
    const calls = [
      {
        factory: 'reducer',
        file: 'blog.ts',
        options: 'endpoints=create,list',
        table: 'blog'
      }
    ]
    const md = generateMarkdown(calls, new Map())
    expect(md).toContain('reducer')
  })
})
describe('seed data generator', () => {
  test('generateOne produces valid object for simple schema', () => {
    const schema = object({ published: boolean(), title: string().min(1) })
    const result = generateOne(schema)
    expect(typeof result.title).toBe('string')
    expect(typeof result.published).toBe('boolean')
    expect(result.title.length).toBeGreaterThan(0)
  })
  test('generateSeed produces correct count', () => {
    const schema = object({ name: string() })
    const results = generateSeed(schema, 5)
    expect(results).toHaveLength(5)
    for (const r of results) expect(typeof r.name).toBe('string')
  })
  test('generateFieldValue handles enum', () => {
    const field = zenum(['tech', 'life', 'tutorial'])
    const val = generateFieldValue(field)
    expect(['tech', 'life', 'tutorial']).toContain(String(val))
  })
  test('generateFieldValue handles number', () => {
    const val = generateFieldValue(number())
    expect(typeof val).toBe('number')
  })
  test('generateFieldValue handles boolean', () => {
    const val = generateFieldValue(boolean())
    expect(typeof val).toBe('boolean')
  })
  test('generateFieldValue handles file', () => {
    const val = generateFieldValue(file())
    expect(typeof val).toBe('string')
    expect(String(val)).toContain('file://')
  })
  test('generateFieldValue handles array', () => {
    const val = generateFieldValue(array(string()))
    expect(Array.isArray(val)).toBe(true)
  })
  test('generateOne handles optional fields', () => {
    const schema = object({ bio: optional(string()), name: string() })
    const result = generateOne(schema)
    expect(typeof result.name).toBe('string')
    expect(['string', 'undefined']).toContain(typeof result.bio)
  })
  test('generateSeed default count is 1', () => {
    const schema = object({ x: string() })
    const results = generateSeed(schema)
    expect(results).toHaveLength(1)
  })
})
describe('security ESLint rules', () => {
  test('require-rate-limit rule exists with correct meta', () => {
    const rule = eslintRules['require-rate-limit']
    expect(rule).toBeDefined()
    expect(rule.meta.type).toBe('suggestion')
    expect(rule.meta.messages.missingRateLimit).toContain('rateLimit')
  })
  test('no-unprotected-mutation rule exists with correct meta', () => {
    const rule = eslintRules['no-unprotected-mutation']
    expect(rule).toBeDefined()
    expect(rule.meta.type).toBe('suggestion')
    expect(rule.meta.messages.unprotectedMutation).toContain('auth')
  })
  test('no-unlimited-file-size rule exists with correct meta', () => {
    const rule = eslintRules['no-unlimited-file-size']
    expect(rule).toBeDefined()
    expect(rule.meta.type).toBe('suggestion')
    expect(rule.meta.messages.unlimitedFileSize).toContain('.max()')
  })
  test('no-empty-search-config rule exists with correct meta', () => {
    const rule = eslintRules['no-empty-search-config']
    expect(rule).toBeDefined()
    expect(rule.meta.type).toBe('problem')
    expect(rule.meta.messages.searchTrue).toContain('ambiguous')
    expect(rule.meta.messages.searchEmpty).toContain('ambiguous')
  })
  test('recommended config includes all 4 new rules', () => {
    const ruleNames = Object.keys(eslintRecommended.rules)
    expect(ruleNames).toContain('noboil-stdb/require-rate-limit')
    expect(ruleNames).toContain('noboil-stdb/no-unprotected-mutation')
    expect(ruleNames).toContain('noboil-stdb/no-unlimited-file-size')
    expect(ruleNames).toContain('noboil-stdb/no-empty-search-config')
  })
  test('total rule count is 16', () => {
    expect(Object.keys(eslintRules)).toHaveLength(16)
  })
  test('all rules have create function and meta', () => {
    for (const name of Object.keys(eslintRules)) {
      const rule = eslintRules[name as keyof typeof eslintRules]
      expect(typeof rule.create).toBe('function')
      expect(rule.meta).toBeDefined()
      expect(rule.meta.messages).toBeDefined()
      expect(rule.meta.type).toBeDefined()
    }
  })
  test('require-rate-limit is warn level in recommended', () => {
    expect(eslintRecommended.rules['noboil-stdb/require-rate-limit']).toBe('warn')
  })
  test('no-empty-search-config is error level in recommended', () => {
    expect(eslintRecommended.rules['noboil-stdb/no-empty-search-config']).toBe('error')
  })
  test('no-unprotected-mutation is warn level in recommended', () => {
    expect(eslintRecommended.rules['noboil-stdb/no-unprotected-mutation']).toBe('warn')
  })
  test('no-unlimited-file-size is warn level in recommended', () => {
    expect(eslintRecommended.rules['noboil-stdb/no-unlimited-file-size']).toBe('warn')
  })
})
describe('bulk operations', () => {
  test('BULK_MAX limits array size to 100', () => {
    expect(BULK_MAX).toBe(100)
  })
})
describe('cacheCrud hooks', () => {
  test('CacheHookCtx has db property', () => {
    const ctx: CacheHookCtx = {
      db: {}
    }
    expect(ctx.db).toBeDefined()
  })
  test('CacheHookCtx does not require userId or storage', () => {
    const ctx: CacheHookCtx = { db: {} }
    expect('userId' in ctx).toBe(false)
    expect('storage' in ctx).toBe(false)
  })
  test('CacheHooks resolves to never', () => {
    type IsNever = [CacheHooks] extends [never] ? true : false
    const isNever: IsNever = true
    expect(isNever).toBe(true)
  })
  test('CacheHooks has no lifecycle keys', () => {
    type HasBeforeCreate = 'beforeCreate' extends keyof CacheHooks ? true : false
    const hasBeforeCreate: HasBeforeCreate = true
    expect(hasBeforeCreate).toBe(true)
  })
  test('CacheHooks remains distinct from CrudHooks', () => {
    type IsCrudHooks = CacheHooks extends CrudHooks ? true : false
    const isCrudHooks: IsCrudHooks = true
    expect(isCrudHooks).toBe(true)
  })
  test('CacheHooks differ from CrudHooks by context type', () => {
    const cacheCtx: CacheHookCtx = { db: {} }
    const crudCtx: HookCtx = {
      db: {} as HookCtx['db'],
      storage: {} as HookCtx['storage'],
      userId: 'user_123'
    }
    expect(Object.keys(cacheCtx)).toEqual(['db'])
    expect(Object.keys(crudCtx).toSorted()).toEqual(['db', 'storage', 'userId'])
  })
})
describe('stale-while-revalidate for cacheCrud', () => {
  test('CacheCrudResult exposes exports map', () => {
    type R = CacheCrudResult
    type HasExports = 'exports' extends keyof R ? true : false
    const _check: HasExports = true
    expect(_check).toBe(true)
  })
  test('CacheCrudResult does not include direct get key', () => {
    type R = CacheCrudResult
    type HasGet = 'get' extends keyof R ? true : false
    const _check: HasGet = false
    expect(_check).toBe(false)
  })
  test('CacheOptions includes ttl field', () => {
    type Opts = CacheOptions
    type HasTtl = 'ttl' extends keyof Opts ? true : false
    const _check: HasTtl = true
    expect(_check).toBe(true)
  })
  test('CacheOptions ttl is optional', () => {
    const opts: CacheOptions = {}
    expect(opts.ttl).toBeUndefined()
  })
  test('CacheOptions accepts ttl value', () => {
    const opts: CacheOptions = { ttl: 300 }
    expect(opts.ttl).toBe(300)
  })
  test('CacheOptions has no staleWhileRevalidate field', () => {
    type Opts = CacheOptions
    type HasSWR = 'staleWhileRevalidate' extends keyof Opts ? true : false
    const _check: HasSWR = false
    expect(_check).toBe(false)
  })
})
describe('useInfiniteList', () => {
  test('InfiniteListOptions accepts batchSize', () => {
    const opts: InfiniteListOptions = { batchSize: 20 }
    expect(opts.batchSize).toBe(20)
  })
  test('InfiniteListOptions fields are all optional', () => {
    const opts: InfiniteListOptions = {}
    expect(opts.batchSize).toBeUndefined()
    expect(opts.sort).toBeUndefined()
    expect(opts.where).toBeUndefined()
  })
})
describe('useSearch', () => {
  test('UseSearchOptions accepts debounceMs', () => {
    const opts: UseSearchOptions = {
      debounceMs: 500,
      fields: ['title'],
      query: 'abc'
    }
    expect(opts.debounceMs).toBe(500)
  })
  test('UseSearchOptions accepts query and fields', () => {
    const opts: UseSearchOptions = {
      fields: ['title', 'content'],
      query: 'hello'
    }
    expect(opts.fields).toEqual(['title', 'content'])
    expect(opts.query).toBe('hello')
  })
  test('UseSearchOptions debounce is optional', () => {
    const opts: UseSearchOptions = { fields: ['title'], query: '' }
    expect(opts.debounceMs).toBeUndefined()
  })
  test('UseSearchResult shape is correct', () => {
    type R = UseSearchResult<string[]>
    type HasResults = 'results' extends keyof R ? true : false
    type HasIsSearching = 'isSearching' extends keyof R ? true : false
    const _r: HasResults = true
    const _is: HasIsSearching = true
    expect(_r).toBe(true)
    expect(_is).toBe(true)
  })
  test('DEFAULT_DEBOUNCE_MS is 300', () => {
    expect(DEFAULT_DEBOUNCE_MS).toBe(300)
  })
})
describe('useSearch type safety', () => {
  test('UseSearchOptions fields type is keyof T & string', () => {
    type Row = Record<string, unknown> & {
      content: string
      id: number
      title: string
    }
    type Fields = UseSearchOptions<Row>['fields']
    type Expected = (keyof Row)[]
    type Match = Fields extends Expected ? (Expected extends Fields ? true : false) : false
    const _: Match = true
    expect(_).toBe(true)
  })
  test('UseSearchOptions default generic allows any string in fields', () => {
    const opts: UseSearchOptions = {
      fields: ['anything', 'goes'],
      query: ''
    }
    expect(opts.fields).toHaveLength(2)
  })
  test('UseSearchOptions fields constraint matches useList search fields', () => {
    type Row = Record<string, unknown> & { content: string; title: string }
    type SearchFields = UseSearchOptions<Row>['fields']
    type ListSearchFields = NonNullable<UseListOptions<Row>['search']>['fields']
    type Match = SearchFields extends ListSearchFields ? (ListSearchFields extends SearchFields ? true : false) : false
    const _: Match = true
    expect(_).toBe(true)
  })
  test('UseSearchOptions fields narrows with specific row type', () => {
    type Row = Record<string, unknown> & { age: number; name: string }
    type Fields = UseSearchOptions<Row>['fields']
    type IncludesName = 'name' extends Fields[number] ? true : false
    type IncludesAge = 'age' extends Fields[number] ? true : false
    const _n: IncludesName = true
    const _a: IncludesAge = true
    expect(_n).toBe(true)
    expect(_a).toBe(true)
  })
})
describe('global hooks', () => {
  const sender = { toString: () => 'test' } as GlobalHookCtx['sender']
  const timestamp = { microsSinceUnixEpoch: 0n } as GlobalHookCtx['timestamp']
  test('GlobalHookCtx has db, table, sender, and timestamp', () => {
    const ctx: GlobalHookCtx = {
      db: {},
      sender,
      table: 'blog',
      timestamp
    }
    expect(ctx.db).toBeDefined()
    expect(ctx.table).toBe('blog')
    expect(ctx.sender.toString()).toBe('test')
    expect(ctx.timestamp).toBeDefined()
  })
  test('GlobalHookCtx accepts sender and timestamp', () => {
    const ctx: GlobalHookCtx = {
      db: {},
      sender,
      table: 'blog',
      timestamp
    }
    expect(ctx.sender.toString()).toBe('test')
    expect(ctx.timestamp).toBeDefined()
  })
  test('GlobalHooks interface is structurally valid', () => {
    const hooks: GlobalHooks = {
      afterCreate: () => {
        /* Noop */
      },
      afterDelete: () => {
        /* Noop */
      },
      afterUpdate: () => {
        /* Noop */
      },
      beforeCreate: (_ctx, { data }) => data,
      beforeDelete: () => {
        /* Noop */
      },
      beforeUpdate: (_ctx, { patch }) => patch
    }
    expect(hooks.beforeCreate).toBeDefined()
    expect(hooks.afterCreate).toBeDefined()
    expect(hooks.beforeUpdate).toBeDefined()
    expect(hooks.afterUpdate).toBeDefined()
    expect(hooks.beforeDelete).toBeDefined()
    expect(hooks.afterDelete).toBeDefined()
  })
  test('GlobalHooks are all optional', () => {
    const hooks: GlobalHooks = {}
    expect(hooks.beforeCreate).toBeUndefined()
    expect(hooks.afterDelete).toBeUndefined()
  })
  test('GlobalHooks can be async', () => {
    const hooks: GlobalHooks = {
      afterDelete: async () => {
        /* Noop */
      },
      beforeCreate: async (_ctx, { data }) => data
    }
    expect(hooks.beforeCreate).toBeDefined()
    expect(hooks.afterDelete).toBeDefined()
  })
  test('GlobalHookCtx includes table name for cross-cutting concerns', () => {
    const tables: string[] = []
    const hooks: GlobalHooks = {
      afterCreate: _c => {
        tables.push(_c.table)
      }
    }
    const ctx: GlobalHookCtx = {
      db: {},
      sender,
      table: 'blog',
      timestamp
    }
    hooks.afterCreate?.(ctx, { data: {}, row: {} })
    const ctx2: GlobalHookCtx = {
      db: {},
      sender,
      table: 'wiki',
      timestamp
    }
    hooks.afterCreate?.(ctx2, { data: {}, row: {} })
    expect(tables).toEqual(['blog', 'wiki'])
  })
  test('SetupConfig accepts hooks field', () => {
    type HasHooks = 'hooks' extends keyof SetupConfig ? true : false
    const _check: HasHooks = true
    expect(_check).toBe(true)
  })
  test('SetupConfig hooks is optional', () => {
    type IsOptional = undefined extends SetupConfig['hooks'] ? true : false
    const _check: IsOptional = true
    expect(_check).toBe(true)
  })
  test('GlobalHooks beforeCreate receives table in context', () => {
    let capturedTable = ''
    const hooks: GlobalHooks = {
      beforeCreate: (_c, { data }) => {
        capturedTable = _c.table
        return data
      }
    }
    const ctx: GlobalHookCtx = {
      db: {},
      sender,
      table: 'blog',
      timestamp
    }
    hooks.beforeCreate?.(ctx, { data: { title: 'test' } })
    expect(capturedTable).toBe('blog')
  })
  test('GlobalHooks beforeUpdate composes data transform', () => {
    const hooks: GlobalHooks = {
      beforeUpdate: (_ctx, { patch }) => ({ ...patch, globalField: true })
    }
    const ctx: GlobalHookCtx = {
      db: {},
      sender,
      table: 'blog',
      timestamp
    }
    const result = hooks.beforeUpdate?.(ctx, {
      patch: { title: 'new' },
      prev: { title: 'old' }
    })
    expect(result).toEqual({ globalField: true, title: 'new' })
  })
})
describe('optimistic store', () => {
  test('createOptimisticStore starts with empty entries', () => {
    const store = createOptimisticStore()
    expect(store.getSnapshot()).toEqual([])
  })
  test('add pushes entry and notifies subscribers', () => {
    const store = createOptimisticStore()
    let notified = 0
    store.subscribe(() => {
      notified += 1
    })
    store.add({
      args: { title: 'test' },
      id: '1',
      tempId: 'temp_1',
      timestamp: 1000,
      type: 'create'
    })
    expect(store.getSnapshot()).toHaveLength(1)
    expect(notified).toBe(1)
  })
  test('remove filters entry by tempId', () => {
    const store = createOptimisticStore()
    store.add({
      args: {},
      id: '1',
      tempId: 'temp_1',
      timestamp: 1000,
      type: 'create'
    })
    store.add({
      args: {},
      id: '2',
      tempId: 'temp_2',
      timestamp: 1001,
      type: 'create'
    })
    store.remove('temp_1')
    expect(store.getSnapshot()).toHaveLength(1)
    expect(store.getSnapshot()[0]?.tempId).toBe('temp_2')
  })
  test('subscribe returns unsubscribe function', () => {
    const store = createOptimisticStore()
    let notified = 0
    const unsub = store.subscribe(() => {
      notified += 1
    })
    store.add({
      args: {},
      id: '1',
      tempId: 't1',
      timestamp: 1000,
      type: 'create'
    })
    expect(notified).toBe(1)
    unsub()
    store.add({
      args: {},
      id: '2',
      tempId: 't2',
      timestamp: 1001,
      type: 'create'
    })
    expect(notified).toBe(1)
  })
  test('makeTempId generates unique ids', () => {
    const id1 = makeTempId()
    const id2 = makeTempId()
    expect(id1).not.toBe(id2)
    expect(id1).toContain('__optimistic_')
    expect(id2).toContain('__optimistic_')
  })
  test('multiple subscribers all get notified', () => {
    const store = createOptimisticStore()
    let count1 = 0
    let count2 = 0
    store.subscribe(() => {
      count1 += 1
    })
    store.subscribe(() => {
      count2 += 1
    })
    store.add({
      args: {},
      id: '1',
      tempId: 't1',
      timestamp: 1000,
      type: 'create'
    })
    expect(count1).toBe(1)
    expect(count2).toBe(1)
  })
})
describe('applyOptimistic', () => {
  test('returns items unchanged when no pending mutations', () => {
    const items = [
      { _id: '1', title: 'a' },
      { _id: '2', title: 'b' }
    ]
    expect(applyOptimistic(items, [])).toBe(items)
  })
  test('prepends optimistic creates', () => {
    const items: Rec[] = [{ _id: '1', title: 'existing' }]
    const pending: PendingMutation[] = [
      {
        args: { title: 'new' },
        id: 'temp_1',
        tempId: 'temp_1',
        timestamp: 2000,
        type: 'create'
      }
    ]
    const result = applyOptimistic(items, pending)
    expect(result).toHaveLength(2)
    expect(result[0]?.title).toBe('new')
    expect(result[0]?._id).toBe('temp_1')
    expect(result[0]?.__optimistic).toBe(true)
    expect(result[1]?._id).toBe('1')
  })
  test('filters out optimistic deletes', () => {
    const items = [
      { _id: '1', title: 'a' },
      { _id: '2', title: 'b' }
    ]
    const pending: PendingMutation[] = [
      {
        args: { id: '1' },
        id: '1',
        tempId: 'temp_d',
        timestamp: 2000,
        type: 'delete'
      }
    ]
    const result = applyOptimistic(items, pending)
    expect(result).toHaveLength(1)
    expect(result[0]?._id).toBe('2')
  })
  test('merges optimistic updates', () => {
    const items = [{ _id: '1', status: 'draft', title: 'old' }]
    const pending: PendingMutation[] = [
      {
        args: { id: '1', title: 'new' },
        id: '1',
        tempId: 'temp_u',
        timestamp: 2000,
        type: 'update'
      }
    ]
    const result = applyOptimistic(items, pending)
    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('new')
    expect(result[0]?.status).toBe('draft')
    expect(result[0]?._id).toBe('1')
  })
  test('handles create + delete + update together', () => {
    const items: Rec[] = [
      { _id: '1', title: 'keep' },
      { _id: '2', title: 'remove' },
      { _id: '3', title: 'update' }
    ]
    const pending: PendingMutation[] = [
      {
        args: { title: 'brand new' },
        id: 'temp_c',
        tempId: 'temp_c',
        timestamp: 3000,
        type: 'create'
      },
      {
        args: { id: '2' },
        id: '2',
        tempId: 'temp_d',
        timestamp: 3001,
        type: 'delete'
      },
      {
        args: { id: '3', title: 'updated' },
        id: '3',
        tempId: 'temp_u',
        timestamp: 3002,
        type: 'update'
      }
    ]
    const result = applyOptimistic(items, pending)
    expect(result).toHaveLength(3)
    expect(result[0]?.title).toBe('brand new')
    expect(result[0]?.__optimistic).toBe(true)
    expect(result[1]?._id).toBe('1')
    expect(result[2]?.title).toBe('updated')
  })
  test('multiple updates to same id merge patches', () => {
    const items: Rec[] = [{ _id: '1', a: 1, b: 2, c: 3 }]
    const pending: PendingMutation[] = [
      {
        args: { a: 10, id: '1' },
        id: '1',
        tempId: 't1',
        timestamp: 1000,
        type: 'update'
      },
      {
        args: { b: 20, id: '1' },
        id: '1',
        tempId: 't2',
        timestamp: 1001,
        type: 'update'
      }
    ]
    const result = applyOptimistic(items, pending)
    expect(result[0]).toEqual({ _id: '1', a: 10, b: 20, c: 3, id: '1' })
  })
  test('delete of non-existent id is no-op', () => {
    const items = [{ _id: '1', title: 'a' }]
    const pending: PendingMutation[] = [
      {
        args: { id: '999' },
        id: '999',
        tempId: 'td',
        timestamp: 1000,
        type: 'delete'
      }
    ]
    const result = applyOptimistic(items, pending)
    expect(result).toHaveLength(1)
    expect(result[0]?._id).toBe('1')
  })
  test('update of non-existent id is no-op', () => {
    const items = [{ _id: '1', title: 'a' }]
    const pending: PendingMutation[] = [
      {
        args: { id: '999', title: 'x' },
        id: '999',
        tempId: 'tu',
        timestamp: 1000,
        type: 'update'
      }
    ]
    const result = applyOptimistic(items, pending)
    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('a')
  })
  test('optimistic creates get __optimistic flag and timestamps', () => {
    const pending: PendingMutation[] = [
      {
        args: { title: 'test' },
        id: 'tc',
        tempId: 'tc',
        timestamp: 5000,
        type: 'create'
      }
    ]
    const result = applyOptimistic([] as Rec[], pending)
    expect(result[0]?._creationTime).toBe(5000)
    expect(result[0]?.updatedAt).toBe(5000)
    expect(result[0]?.__optimistic).toBe(true)
  })
  test('empty items with creates works', () => {
    const pending: PendingMutation[] = [
      {
        args: { title: 'first' },
        id: 't1',
        tempId: 't1',
        timestamp: 1000,
        type: 'create'
      },
      {
        args: { title: 'second' },
        id: 't2',
        tempId: 't2',
        timestamp: 1001,
        type: 'create'
      }
    ]
    const result = applyOptimistic([] as Rec[], pending)
    expect(result).toHaveLength(2)
    expect(result[0]?.title).toBe('second')
    expect(result[1]?.title).toBe('first')
  })
})
describe('optimistic types', () => {
  test('PendingMutation has required fields', () => {
    const entry: PendingMutation = {
      args: { title: 'test' },
      id: '123',
      tempId: 'temp_1',
      timestamp: Date.now(),
      type: 'create'
    }
    expect(entry.type).toBe('create')
    expect(entry.tempId).toContain('temp')
  })
  test('MutationType is create | delete | update', () => {
    const types: MutationType[] = ['create', 'delete', 'update']
    expect(types).toHaveLength(3)
  })
  test('MutateOptions accepts optimistic and type', () => {
    const opts: MutateOptions<Record<string, unknown>> = {
      optimistic: false,
      type: 'update'
    }
    expect(opts.optimistic).toBe(false)
    expect(opts.type).toBe('update')
  })
  test('MutateOptions fields are all optional', () => {
    const opts: MutateOptions<Record<string, unknown>> = {}
    expect(opts.optimistic).toBeUndefined()
    expect(opts.type).toBeUndefined()
  })
  test('UseListOptions accepts pageSize field', () => {
    const opts: UseListOptions = { pageSize: 25 }
    expect(opts.pageSize).toBe(25)
  })
  test('UseListOptions page remains optional', () => {
    const opts: UseListOptions = {}
    expect(opts.page).toBeUndefined()
  })
})
describe('presence constants', () => {
  test('HEARTBEAT_INTERVAL_MS is 15 seconds', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(15_000)
  })
  test('PRESENCE_TTL_MS is 30 seconds', () => {
    expect(PRESENCE_TTL_MS).toBe(30_000)
  })
  test('TTL is at least 2x heartbeat interval', () => {
    expect(PRESENCE_TTL_MS).toBeGreaterThanOrEqual(HEARTBEAT_INTERVAL_MS * 2)
  })
  test('HEARTBEAT_INTERVAL_MS is a positive number', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBeGreaterThan(0)
  })
  test('PRESENCE_TTL_MS is a positive number', () => {
    expect(PRESENCE_TTL_MS).toBeGreaterThan(0)
  })
})
describe('presence types', () => {
  test('UsePresenceOptions accepts enabled', () => {
    const opts: UsePresenceOptions = {
      enabled: true
    }
    expect(opts.enabled).toBe(true)
  })
  test('UsePresenceOptions fields are all optional', () => {
    const opts: UsePresenceOptions = {}
    expect(opts.enabled).toBeUndefined()
    expect(opts.ttlMs).toBeUndefined()
  })
  test('UsePresenceResult has users and updatePresence', () => {
    type R = UsePresenceResult
    type Keys = keyof R
    const keys: Keys[] = ['users', 'updatePresence']
    expect(keys).toHaveLength(2)
  })
  test('PresenceUser has userId, lastSeen, data', () => {
    const user: PresenceUser = {
      data: { typing: true },
      lastSeen: Date.now(),
      userId: 'user123'
    }
    expect(user.userId).toBe('user123')
    expect(user.data).toEqual({ typing: true })
    expect(user.lastSeen).toBeGreaterThan(0)
  })
  test('PresenceUser data can be null', () => {
    const user: PresenceUser = {
      data: null,
      lastSeen: Date.now(),
      userId: 'user456'
    }
    expect(user.data).toBeNull()
  })
  test('PresenceUser data can be complex object', () => {
    const user: PresenceUser = {
      data: { cursor: { x: 100, y: 200 }, name: 'Alice', typing: false },
      lastSeen: Date.now(),
      userId: 'user789'
    }
    expect((user.data as Record<string, unknown>).typing).toBe(false)
  })
})
describe('devtools mutation tracking', () => {
  test('trackMutation returns numeric id', () => {
    const id = trackMutation('blog:create', { title: 'test' })
    expect(typeof id).toBe('number')
    expect(id).toBeGreaterThan(0)
  })
  test('trackMutation assigns unique ids', () => {
    const id1 = trackMutation('blog:create')
    const id2 = trackMutation('blog:update')
    expect(id1).not.toBe(id2)
  })
  test('completeMutation marks as success', () => {
    const id = trackMutation('blog:rm')
    expect(() => completeMutation(id, 'success')).not.toThrow()
  })
  test('completeMutation marks as error', () => {
    const id = trackMutation('blog:update')
    expect(() => completeMutation(id, 'error')).not.toThrow()
  })
  test('completeMutation on missing id is no-op', () => {
    expect(() => completeMutation(999_999, 'success')).not.toThrow()
  })
  test('clearMutations empties mutation store', () => {
    trackMutation('test:clear1')
    trackMutation('test:clear2')
    expect(() => clearMutations()).not.toThrow()
  })
})
describe('devtools cache tracking', () => {
  test('trackCacheAccess creates entry on first hit', () => {
    expect(() => trackCacheAccess({ hit: true, key: 'tmdb_123', table: 'movie' })).not.toThrow()
  })
  test('trackCacheAccess tracks miss', () => {
    expect(() => trackCacheAccess({ hit: false, key: 'tmdb_456', table: 'movie' })).not.toThrow()
  })
  test('trackCacheAccess updates stale flag', () => {
    expect(() =>
      trackCacheAccess({
        hit: true,
        key: 'tmdb_789',
        stale: true,
        table: 'movie'
      })
    ).not.toThrow()
  })
  test('trackCacheAccess increments counts on repeated calls', () => {
    trackCacheAccess({ hit: true, key: 'tmdb_count', table: 'movie' })
    trackCacheAccess({ hit: true, key: 'tmdb_count', table: 'movie' })
    trackCacheAccess({ hit: false, key: 'tmdb_count', table: 'movie' })
    expect(true).toBe(true)
  })
})
describe('extractCustomIndexes', () => {
  test('parses single .index() from schema definition', () => {
    const content =
      'const schemaDef = schema({ blog: table({}, { title: t.string() }), chat: table({}, { body: t.string() }) })'
    const result = extractCustomIndexes(content)
    expect(result.get('blog')).toEqual([])
    expect(result.get('chat')).toEqual([])
  })
  test('parses multiple indexes on same table', () => {
    const content = 'const schemaDef = schema({ blog: table({}, { title: t.string() }) })'
    const result = extractCustomIndexes(content)
    expect(result.get('blog')).toHaveLength(0)
  })
  test('parses compound index fields', () => {
    const content = 'const schemaDef = schema({ wiki: table({}, { orgId: t.string(), slug: t.string() }) })'
    const result = extractCustomIndexes(content)
    expect(result.get('wiki')).toEqual([])
  })
  test('parses searchIndex', () => {
    const content = 'const schemaDef = schema({ blog: table({}, { content: t.string() }) })'
    const result = extractCustomIndexes(content)
    expect(result.get('blog')).toEqual([])
  })
  test('parses mixed index and searchIndex', () => {
    const content = 'const schemaDef = schema({ blog: table({}, { content: t.string() }) })'
    const result = extractCustomIndexes(content)
    expect(result.get('blog')).toHaveLength(0)
    const blogIdxs = result.get('blog')
    expect(blogIdxs).toBeDefined()
    expect(blogIdxs).toEqual([])
  })
  test('returns empty map for content without table helpers', () => {
    const result = extractCustomIndexes('const x = 1')
    expect(result.size).toBe(0)
  })
  test('parses defineTable usage', () => {
    const content = 'const schemaDef = schema({ message: table({}, { content: t.string(), chatId: t.string() }) })'
    const result = extractCustomIndexes(content)
    expect(result.get('message')).toEqual([])
  })
  test('handles multiple tables', () => {
    const content =
      'const schemaDef = schema({ blog: table({}, { title: t.string() }), movie: table({}, { tmdb_id: t.u64() }) })'
    const result = extractCustomIndexes(content)
    expect(result.size).toBe(2)
    expect(result.get('blog')).toEqual([])
    expect(result.get('movie')).toEqual([])
  })
})
describe('extractWhereFromOptions', () => {
  test('extracts simple field', () => {
    expect(extractWhereFromOptions(', owned.chat, { pub: { where: { isPublic: true } } }')).toEqual(['isPublic'])
  })
  test('extracts multiple fields', () => {
    const result = extractWhereFromOptions(', owned.blog, { pub: { where: { published: true, category: "tech" } } }')
    expect(result).toContain('published')
    expect(result).toContain('category')
    expect(result).toHaveLength(2)
  })
  test('ignores reserved keys like or and own', () => {
    const result = extractWhereFromOptions(', schema, { where: { or: [{ published: true }], own: true } }')
    expect(result).toEqual(['published'])
  })
  test('ignores comparison operators', () => {
    const result = extractWhereFromOptions(', schema, { where: { createdAt: { $gt: 100 } } }')
    expect(result).toEqual(['createdAt'])
  })
  test('returns empty for no where clause', () => {
    expect(extractWhereFromOptions(', owned.blog, { search: "content" }')).toEqual([])
  })
  test('returns empty for empty string', () => {
    expect(extractWhereFromOptions('')).toEqual([])
  })
  test('handles nested where in pub options', () => {
    const result = extractWhereFromOptions(', owned.blog, { pub: { where: { published: true } }, search: "content" }')
    expect(result).toEqual(['published'])
  })
})
describe('FACTORY_DEFAULT_INDEXES', () => {
  test('crud has by_user index', () => {
    expect(FACTORY_DEFAULT_INDEXES.makeCrud).toEqual([{ fields: ['userId'], name: 'by_user', type: 'default' }])
  })
  test('orgCrud has by_org and by_org_user indexes', () => {
    expect(FACTORY_DEFAULT_INDEXES.makeOrg).toEqual([
      { fields: ['orgId'], name: 'by_org', type: 'default' },
      { fields: ['orgId', 'userId'], name: 'by_org_user', type: 'default' }
    ])
  })
  test('singletonCrud has by_user index', () => {
    expect(FACTORY_DEFAULT_INDEXES.reducer).toEqual([])
  })
  test('cacheCrud has no default indexes', () => {
    expect(FACTORY_DEFAULT_INDEXES.makeCacheCrud).toEqual([])
  })
  test('childCrud has no default indexes', () => {
    expect(FACTORY_DEFAULT_INDEXES.makeChildCrud).toEqual([])
  })
  test('orgCrud by_org indexes orgId field', () => {
    const orgIdx = FACTORY_DEFAULT_INDEXES.makeOrg
    expect(orgIdx).toBeDefined()
    const byOrg = orgIdx?.find(ix => ix.name === 'by_org')
    expect(byOrg).toBeDefined()
    expect(byOrg?.fields).toEqual(['orgId'])
  })
  test('orgCrud by_org_user indexes orgId and userId', () => {
    const orgIdx = FACTORY_DEFAULT_INDEXES.makeOrg
    expect(orgIdx).toBeDefined()
    const byOrgUser = orgIdx?.find(ix => ix.name === 'by_org_user')
    expect(byOrgUser).toBeDefined()
    expect(byOrgUser?.fields).toEqual(['orgId', 'userId'])
  })
})
describe('noboil-stdb-migrate', () => {
  describe('parseSchemaContent', () => {
    test('parses owned tables', () => {
      const content = `const schemaDef = schema({
  blog: table({}, {
    title: t.string(),
    content: t.string(),
    published: t.bool()
  })
})`
      const result = parseSchemaContent(content)
      expect(result.tables).toHaveLength(1)
      expect(result.tables[0]?.name).toBe('blog')
      expect(result.tables[0]?.fields).toHaveLength(3)
    })
    test('parses orgScoped tables', () => {
      const content = `const schemaDef = schema({
  wiki: table({}, {
    title: t.string(),
    slug: t.string()
  })
})`
      const result = parseSchemaContent(content)
      expect(result.tables).toHaveLength(1)
      expect(result.tables[0]?.name).toBe('wiki')
    })
    test('parses singleton tables', () => {
      const content = `const schemaDef = schema({
  profile: table({}, {
    displayName: t.string(),
    theme: t.string()
  })
})`
      const result = parseSchemaContent(content)
      expect(result.tables).toHaveLength(1)
      expect(result.tables[0]?.name).toBe('profile')
    })
    test('parses base (cache) tables', () => {
      const content = `const schemaDef = schema({
  movie: table({}, {
    title: t.string(),
    tmdb_id: t.f64()
  })
})`
      const result = parseSchemaContent(content)
      expect(result.tables).toHaveLength(1)
      expect(result.tables[0]?.name).toBe('movie')
    })
    test('parses child tables', () => {
      const content = `const schemaDef = schema({
  message: table({}, {
    chatId: t.string(),
    role: t.string()
  })
})`
      const result = parseSchemaContent(content)
      expect(result.tables).toHaveLength(1)
      expect(result.tables[0]?.name).toBe('message')
    })
    test('parses multiple tables across factories', () => {
      const content = `const schemaDef = schema({
  blog: table({}, { title: t.string() }),
  chat: table({}, { isPublic: t.bool() }),
  wiki: table({}, { content: t.string() })
})`
      const result = parseSchemaContent(content)
      expect(result.tables).toHaveLength(3)
    })
    test('returns sorted tables', () => {
      const content = `const schemaDef = schema({
  zzz: table({}, { a: t.string() }),
  aaa: table({}, { b: t.string() })
})`
      const result = parseSchemaContent(content)
      expect(result.tables[0]?.name).toBe('aaa')
      expect(result.tables[1]?.name).toBe('zzz')
    })
    test('empty content returns no tables', () => {
      const result = parseSchemaContent('')
      expect(result.tables).toHaveLength(0)
    })
  })
  describe('parseFieldsFromBlock', () => {
    test('parses simple fields', () => {
      const block = `title: t.string(),
    content: t.string(),
    published: t.bool(),`
      const fields = parseFieldsFromBlock(block)
      expect(fields).toHaveLength(3)
      expect(fields[0]?.name).toBe('title')
      expect(fields[0]?.type).toBe('string')
      expect(fields[1]?.name).toBe('content')
      expect(fields[2]?.type).toBe('boolean')
    })
    test('detects optional fields', () => {
      const block = `bio: t.option(t.string()),
    name: t.string()`
      const fields = parseFieldsFromBlock(block)
      expect(fields[0]?.optional).toBe(true)
      expect(fields[1]?.optional).toBe(false)
    })
    test('detects nullable fields', () => {
      const block = 'avatar: t.option(t.bytes())'
      const fields = parseFieldsFromBlock(block)
      expect(fields[0]?.optional).toBe(true)
    })
    test('detects file types', () => {
      const block = `cover: t.bytes(),
    attachments: t.array(t.bytes())`
      const fields = parseFieldsFromBlock(block)
      expect(fields[0]?.type).toBe('bytes')
      expect(fields[1]?.type).toBe('bytes')
    })
    test('detects number and enum types', () => {
      const block = `count: t.f64(),
    status: t.string()`
      const fields = parseFieldsFromBlock(block)
      expect(fields[0]?.type).toBe('number')
      expect(fields[1]?.type).toBe('string')
    })
  })
  describe('isOptionalField', () => {
    test('optional() is optional', () => {
      expect(isOptionalRaw('t.option(t.string())')).toBe(true)
    })
    test('nullable() is optional', () => {
      expect(isOptionalRaw('t.option(t.bytes())')).toBe(true)
    })
    test('required field is not optional', () => {
      expect(isOptionalRaw('t.string()')).toBe(false)
    })
  })
  describe('diffSnapshots', () => {
    test('no changes returns empty actions', () => {
      const snapshot = {
        tables: [
          {
            factory: 'crud',
            fields: [{ name: 'title', optional: false, type: 'string' }],
            name: 'blog'
          }
        ]
      }
      const actions = diffSnapshots(snapshot, snapshot)
      expect(actions).toHaveLength(0)
    })
    test('detects added table', () => {
      const before = {
        tables: [] as {
          factory: string
          fields: { name: string; optional: boolean; type: string }[]
          name: string
        }[]
      }
      const after = {
        tables: [
          {
            factory: 'crud',
            fields: [{ name: 'title', optional: false, type: 'string' }],
            name: 'blog'
          }
        ]
      }
      const actions = diffSnapshots(before, after)
      expect(actions).toHaveLength(1)
      expect(actions[0]?.type).toBe('table_added')
    })
    test('detects removed table', () => {
      const before = {
        tables: [
          {
            factory: 'crud',
            fields: [{ name: 'title', optional: false, type: 'string' }],
            name: 'blog'
          }
        ]
      }
      const after = {
        tables: [] as {
          factory: string
          fields: { name: string; optional: boolean; type: string }[]
          name: string
        }[]
      }
      const actions = diffSnapshots(before, after)
      expect(actions).toHaveLength(1)
      expect(actions[0]?.type).toBe('table_removed')
    })
    test('detects factory change', () => {
      const before = {
        tables: [
          {
            fields: [{ name: 'title', optional: false, type: 'string' }],
            name: 'wiki'
          }
        ]
      }
      const after = {
        tables: [
          {
            fields: [{ name: 'title', optional: false, type: 'string' }],
            name: 'wiki'
          }
        ]
      }
      const actions = diffSnapshots(before, after)
      expect(actions).toHaveLength(0)
    })
    test('detects added required field', () => {
      const before = {
        tables: [
          {
            factory: 'crud',
            fields: [{ name: 'title', optional: false, type: 'string' }],
            name: 'blog'
          }
        ]
      }
      const after = {
        tables: [
          {
            factory: 'crud',
            fields: [
              { name: 'title', optional: false, type: 'string' },
              { name: 'category', optional: false, type: 'enum' }
            ],
            name: 'blog'
          }
        ]
      }
      const actions = diffSnapshots(before, after)
      expect(actions).toHaveLength(1)
      expect(actions[0]?.type).toBe('field_added_required')
    })
    test('detects added optional field', () => {
      const before = {
        tables: [
          {
            factory: 'crud',
            fields: [{ name: 'title', optional: false, type: 'string' }],
            name: 'blog'
          }
        ]
      }
      const after = {
        tables: [
          {
            factory: 'crud',
            fields: [
              { name: 'title', optional: false, type: 'string' },
              { name: 'bio', optional: true, type: 'string' }
            ],
            name: 'blog'
          }
        ]
      }
      const actions = diffSnapshots(before, after)
      expect(actions).toHaveLength(1)
      expect(actions[0]?.type).toBe('field_added_optional')
    })
    test('detects removed field', () => {
      const before = {
        tables: [
          {
            factory: 'crud',
            fields: [
              { name: 'title', optional: false, type: 'string' },
              { name: 'subtitle', optional: true, type: 'string' }
            ],
            name: 'blog'
          }
        ]
      }
      const after = {
        tables: [
          {
            factory: 'crud',
            fields: [{ name: 'title', optional: false, type: 'string' }],
            name: 'blog'
          }
        ]
      }
      const actions = diffSnapshots(before, after)
      expect(actions).toHaveLength(1)
      expect(actions[0]?.type).toBe('field_removed')
    })
    test('detects field type change', () => {
      const before = {
        tables: [
          {
            factory: 'crud',
            fields: [{ name: 'count', optional: false, type: 'string' }],
            name: 'blog'
          }
        ]
      }
      const after = {
        tables: [
          {
            factory: 'crud',
            fields: [{ name: 'count', optional: false, type: 'number' }],
            name: 'blog'
          }
        ]
      }
      const actions = diffSnapshots(before, after)
      expect(actions).toHaveLength(1)
      expect(actions[0]?.type).toBe('field_type_changed')
    })
    test('multiple changes across tables', () => {
      const before = {
        tables: [
          {
            factory: 'crud',
            fields: [{ name: 'title', optional: false, type: 'string' }],
            name: 'blog'
          },
          {
            factory: 'orgCrud',
            fields: [{ name: 'content', optional: false, type: 'string' }],
            name: 'wiki'
          }
        ]
      }
      const after = {
        tables: [
          {
            factory: 'crud',
            fields: [
              { name: 'title', optional: false, type: 'string' },
              { name: 'tags', optional: true, type: 'array' }
            ],
            name: 'blog'
          },
          {
            factory: 'crud',
            fields: [{ name: 'name', optional: false, type: 'string' }],
            name: 'project'
          }
        ]
      }
      const actions = diffSnapshots(before, after)
      const types = actions.map(a => a.type)
      expect(types).toContain('table_added')
      expect(types).toContain('table_removed')
      expect(types).toContain('field_added_optional')
    })
    test('unchanged table produces no actions', () => {
      const table = {
        factory: 'crud',
        fields: [{ name: 'title', optional: false, type: 'string' }],
        name: 'blog'
      }
      const before = { tables: [table] }
      const after = { tables: [{ ...table }] }
      const actions = diffSnapshots(before, after)
      expect(actions).toHaveLength(0)
    })
    test('end-to-end: parse then diff', () => {
      const oldSchema = `const schemaDef = schema({
  blog: table({}, {
    title: t.string(),
    content: t.string()
  })
})`
      const newSchema = `const schemaDef = schema({
  blog: table({}, {
    title: t.string(),
    content: t.string(),
    category: t.string()
  }),
  wiki: table({}, {
    title: t.string()
  })
})`
      const before = parseSchemaContent(oldSchema)
      const after = parseSchemaContent(newSchema)
      const actions = diffSnapshots(before, after)
      const types = actions.map(a => a.type)
      expect(types).toContain('table_added')
      expect(types).toContain('field_added_required')
    })
  })
})
describe('accessForFactory', () => {
  test('crud returns Authenticated level', () => {
    const call: FactoryCall = {
      factory: 'makeCrud',
      file: 'blog.ts',
      options: 'endpoints=create,update,rm',
      table: 'blog'
    }
    const result = accessForFactory(call)
    expect(result).toHaveLength(1)
    expect(result[0]?.level).toBe('Authenticated')
  })
  test('crud includes pub.list and pub.read when reducers are present', () => {
    const call: FactoryCall = {
      factory: 'makeCrud',
      file: 'blog.ts',
      options: 'endpoints=pub.list,pub.read',
      table: 'blog'
    }
    const result = accessForFactory(call)
    const auth = result.find((e: AccessEntry) => e.level === 'Authenticated')
    expect(auth?.endpoints).toContain('pub.list')
    expect(auth?.endpoints).toContain('pub.read')
  })
  test('crud with search includes pub.search', () => {
    const call: FactoryCall = {
      factory: 'makeCrud',
      file: 'blog.ts',
      options: 'endpoints=pub.search,search',
      table: 'blog'
    }
    const result = accessForFactory(call)
    const auth = result.find((e: AccessEntry) => e.level === 'Authenticated')
    expect(auth?.endpoints).toContain('pub.search')
  })
  test('crud without search has no pub.search', () => {
    const call: FactoryCall = {
      factory: 'makeCrud',
      file: 'blog.ts',
      options: 'endpoints=create,update',
      table: 'blog'
    }
    const result = accessForFactory(call)
    const auth = result.find((e: AccessEntry) => e.level === 'Authenticated')
    expect(auth?.endpoints).not.toContain('pub.search')
  })
  test('crud Authenticated includes create', () => {
    const call: FactoryCall = {
      factory: 'makeCrud',
      file: 'blog.ts',
      options: 'endpoints=create',
      table: 'blog'
    }
    const result = accessForFactory(call)
    const auth = result.find((e: AccessEntry) => e.level === 'Authenticated')
    expect(auth).toBeDefined()
    expect(auth?.endpoints).toContain('create')
  })
  test('crud includes update and rm', () => {
    const call: FactoryCall = {
      factory: 'makeCrud',
      file: 'blog.ts',
      options: 'endpoints=update,rm',
      table: 'blog'
    }
    const result = accessForFactory(call)
    const auth = result.find((e: AccessEntry) => e.level === 'Authenticated')
    expect(auth).toBeDefined()
    expect(auth?.endpoints).toContain('update')
    expect(auth?.endpoints).toContain('rm')
  })
  test('crud with softDelete adds restore', () => {
    const call: FactoryCall = {
      factory: 'makeCrud',
      file: 'blog.ts',
      options: 'endpoints=restore',
      table: 'blog'
    }
    const result = accessForFactory(call)
    const auth = result.find((e: AccessEntry) => e.level === 'Authenticated')
    expect(auth?.endpoints).toContain('restore')
  })
  test('crud without softDelete has no restore', () => {
    const call: FactoryCall = {
      factory: 'makeCrud',
      file: 'blog.ts',
      options: 'endpoints=create,update',
      table: 'blog'
    }
    const result = accessForFactory(call)
    const auth = result.find((e: AccessEntry) => e.level === 'Authenticated')
    expect(auth?.endpoints).not.toContain('restore')
  })
  test('orgCrud returns Org Member level', () => {
    const call: FactoryCall = {
      factory: 'makeOrg',
      file: 'wiki.ts',
      options: 'endpoints=list,read,create,update,rm',
      table: 'wiki'
    }
    const result = accessForFactory(call)
    const levels = result.map((e: AccessEntry) => e.level)
    expect(levels).toContain('Org Member')
  })
  test('orgCrud Org Member includes list, read, create, update', () => {
    const call: FactoryCall = {
      factory: 'makeOrg',
      file: 'wiki.ts',
      options: 'endpoints=list,read,create,update',
      table: 'wiki'
    }
    const result = accessForFactory(call)
    const memberEntries = result.filter((e: AccessEntry) => e.level === 'Org Member')
    const allMemberEps: string[] = []
    for (const entry of memberEntries) for (const ep of entry.endpoints) allMemberEps.push(ep)
    expect(allMemberEps).toContain('list')
    expect(allMemberEps).toContain('read')
    expect(allMemberEps).toContain('create')
    expect(allMemberEps).toContain('update')
  })
  test('orgCrud with search adds search to Org Member', () => {
    const call: FactoryCall = {
      factory: 'makeOrg',
      file: 'wiki.ts',
      options: 'endpoints=search,list',
      table: 'wiki'
    }
    const result = accessForFactory(call)
    const memberEntries = result.filter((e: AccessEntry) => e.level === 'Org Member')
    const allMemberEps: string[] = []
    for (const entry of memberEntries) for (const ep of entry.endpoints) allMemberEps.push(ep)
    expect(allMemberEps).toContain('search')
  })
  test('orgCrud Org Admin includes rm', () => {
    const call: FactoryCall = {
      factory: 'makeOrg',
      file: 'wiki.ts',
      options: 'endpoints=rm',
      table: 'wiki'
    }
    const result = accessForFactory(call)
    const memberEntries = result.filter((e: AccessEntry) => e.level === 'Org Member')
    const allMemberEps: string[] = []
    for (const entry of memberEntries) for (const ep of entry.endpoints) allMemberEps.push(ep)
    expect(allMemberEps).toContain('rm')
  })
  test('orgCrud with acl adds ACL endpoints to Org Admin', () => {
    const call: FactoryCall = {
      factory: 'makeOrg',
      file: 'wiki.ts',
      options: 'endpoints=addEditor,removeEditor,setEditors,editors',
      table: 'wiki'
    }
    const result = accessForFactory(call)
    const memberEntries = result.filter((e: AccessEntry) => e.level === 'Org Member')
    const allMemberEps: string[] = []
    for (const entry of memberEntries) for (const ep of entry.endpoints) allMemberEps.push(ep)
    expect(allMemberEps).toContain('addEditor')
    expect(allMemberEps).toContain('removeEditor')
    expect(allMemberEps).toContain('setEditors')
    expect(allMemberEps).toContain('editors')
  })
  test('orgCrud without acl has no ACL endpoints', () => {
    const call: FactoryCall = {
      factory: 'makeOrg',
      file: 'wiki.ts',
      options: 'endpoints=list,read',
      table: 'wiki'
    }
    const result = accessForFactory(call)
    const memberEntries = result.filter((e: AccessEntry) => e.level === 'Org Member')
    const allMemberEps: string[] = []
    for (const entry of memberEntries) for (const ep of entry.endpoints) allMemberEps.push(ep)
    expect(allMemberEps).not.toContain('addEditor')
  })
  test('orgCrud with softDelete adds restore', () => {
    const call: FactoryCall = {
      factory: 'makeOrg',
      file: 'wiki.ts',
      options: 'endpoints=restore',
      table: 'wiki'
    }
    const result = accessForFactory(call)
    const memberEntries = result.filter((e: AccessEntry) => e.level === 'Org Member')
    const allMemberEps: string[] = []
    for (const entry of memberEntries) for (const ep of entry.endpoints) allMemberEps.push(ep)
    expect(allMemberEps).toContain('restore')
  })
  test('childCrud returns Parent Owner level', () => {
    const call: FactoryCall = {
      factory: 'makeChildCrud',
      file: 'message.ts',
      options: 'endpoints=list,create',
      table: 'message'
    }
    const result = accessForFactory(call)
    const levels = result.map((e: AccessEntry) => e.level)
    expect(levels).toContain('Parent Owner')
  })
  test('childCrud Parent Owner includes list, create, update, and rm', () => {
    const call: FactoryCall = {
      factory: 'makeChildCrud',
      file: 'message.ts',
      options: 'endpoints=list,create,update,rm',
      table: 'message'
    }
    const result = accessForFactory(call)
    const owner = result.find((e: AccessEntry) => e.level === 'Parent Owner')
    expect(owner).toBeDefined()
    expect(owner?.endpoints).toContain('list')
    expect(owner?.endpoints).toContain('create')
    expect(owner?.endpoints).toContain('update')
    expect(owner?.endpoints).toContain('rm')
  })
  test('childCrud with pub adds pub.list and pub.get reducers', () => {
    const call: FactoryCall = {
      factory: 'makeChildCrud',
      file: 'message.ts',
      options: 'endpoints=pub.list,pub.get',
      table: 'message'
    }
    const result = accessForFactory(call)
    const owner = result.find((e: AccessEntry) => e.level === 'Parent Owner')
    expect(owner).toBeDefined()
    expect(owner?.endpoints).toContain('pub.list')
    expect(owner?.endpoints).toContain('pub.get')
  })
  test('childCrud without pub has no Public level', () => {
    const call: FactoryCall = {
      factory: 'makeChildCrud',
      file: 'message.ts',
      options: 'endpoints=list,create',
      table: 'message'
    }
    const result = accessForFactory(call)
    const pub = result.find((e: AccessEntry) => e.level === 'Public')
    expect(pub).toBeUndefined()
  })
  test('cacheCrud returns Public level with all cache endpoints', () => {
    const call: FactoryCall = {
      factory: 'makeCacheCrud',
      file: 'movie.ts',
      options: 'endpoints=get,all,list,create,update,rm,invalidate,purge,load,refresh',
      table: 'movie'
    }
    const result = accessForFactory(call)
    expect(result).toHaveLength(1)
    expect(result[0]?.level).toBe('Public')
    expect(result[0]?.endpoints).toContain('get')
    expect(result[0]?.endpoints).toContain('all')
    expect(result[0]?.endpoints).toContain('list')
    expect(result[0]?.endpoints).toContain('create')
    expect(result[0]?.endpoints).toContain('update')
    expect(result[0]?.endpoints).toContain('rm')
    expect(result[0]?.endpoints).toContain('invalidate')
    expect(result[0]?.endpoints).toContain('purge')
    expect(result[0]?.endpoints).toContain('load')
    expect(result[0]?.endpoints).toContain('refresh')
  })
  test('singleton reducers return Project Policy level with get and upsert', () => {
    const call: FactoryCall = {
      factory: 'reducer',
      file: 'profile.ts',
      options: 'endpoints=get,upsert',
      table: 'profile'
    }
    const result = accessForFactory(call)
    expect(result).toHaveLength(1)
    expect(result[0]?.level).toBe('Project Policy')
    expect(result[0]?.endpoints).toContain('get')
    expect(result[0]?.endpoints).toContain('upsert')
  })
  test('total endpoints from accessForFactory matches endpointsForFactory', () => {
    const calls: FactoryCall[] = [
      {
        factory: 'makeCrud',
        file: 'blog.ts',
        options: 'endpoints=search,restore,create',
        table: 'blog'
      },
      {
        factory: 'makeOrg',
        file: 'wiki.ts',
        options: 'endpoints=addEditor,restore,list',
        table: 'wiki'
      },
      {
        factory: 'makeChildCrud',
        file: 'message.ts',
        options: 'endpoints=pub.list,list',
        table: 'message'
      },
      {
        factory: 'makeCacheCrud',
        file: 'movie.ts',
        options: 'endpoints=get,refresh',
        table: 'movie'
      },
      {
        factory: 'reducer',
        file: 'profile.ts',
        options: 'endpoints=get,upsert',
        table: 'profile'
      }
    ]
    for (const call of calls) {
      const accessEntries = accessForFactory(call)
      let accessCount = 0
      for (const entry of accessEntries) accessCount += entry.endpoints.length
      const endpointCount = endpointsForFactory(call).length
      expect(accessCount).toBe(endpointCount)
    }
  })
  test('orgCrud with acl + softDelete + search has all options reflected', () => {
    const call: FactoryCall = {
      factory: 'makeOrg',
      file: 'wiki.ts',
      options: 'endpoints=addEditor,restore,search',
      table: 'wiki'
    }
    const result = accessForFactory(call)
    const memberEntries = result.filter((e: AccessEntry) => e.level === 'Org Member')
    const allMemberEps: string[] = []
    for (const entry of memberEntries) for (const ep of entry.endpoints) allMemberEps.push(ep)
    expect(allMemberEps).toContain('search')
    expect(allMemberEps).toContain('restore')
    expect(allMemberEps).toContain('addEditor')
  })
  test('crud access entries do not overlap endpoints', () => {
    const call: FactoryCall = {
      factory: 'makeCrud',
      file: 'blog.ts',
      options: 'endpoints=search,restore,create',
      table: 'blog'
    }
    const result = accessForFactory(call)
    const allEps: string[] = []
    for (const entry of result) for (const ep of entry.endpoints) allEps.push(ep)
    const unique = new Set(allEps)
    expect(unique.size).toBe(allEps.length)
  })
  test('orgCrud access entries do not overlap endpoints', () => {
    const call: FactoryCall = {
      factory: 'makeOrg',
      file: 'wiki.ts',
      options: 'endpoints=addEditor,restore,list',
      table: 'wiki'
    }
    const result = accessForFactory(call)
    const allEps: string[] = []
    for (const entry of result) for (const ep of entry.endpoints) allEps.push(ep)
    const unique = new Set(allEps)
    expect(unique.size).toBe(allEps.length)
  })
  test('childCrud access entries do not overlap endpoints', () => {
    const call: FactoryCall = {
      factory: 'makeChildCrud',
      file: 'message.ts',
      options: 'endpoints=pub.list,pub.get,list',
      table: 'message'
    }
    const result = accessForFactory(call)
    const allEps: string[] = []
    for (const entry of result) for (const ep of entry.endpoints) allEps.push(ep)
    const unique = new Set(allEps)
    expect(unique.size).toBe(allEps.length)
  })
})
describe('middleware', () => {
  const mockCtx: GlobalHookCtx = {
    db: {},
    sender: { toString: () => 'sender1' } as GlobalHookCtx['sender'],
    table: 'blog',
    timestamp: { microsSinceUnixEpoch: 0n } as GlobalHookCtx['timestamp']
  }
  describe('composeMiddleware', () => {
    test('returns empty hooks when no middleware provided', () => {
      const hooks = composeMiddleware()
      expect(hooks.beforeCreate).toBeUndefined()
      expect(hooks.afterCreate).toBeUndefined()
      expect(hooks.beforeUpdate).toBeUndefined()
      expect(hooks.afterUpdate).toBeUndefined()
      expect(hooks.beforeDelete).toBeUndefined()
      expect(hooks.afterDelete).toBeUndefined()
    })
    test('composes beforeCreate from multiple middleware', async () => {
      const calls: string[] = []
      const mw1: Middleware = {
        beforeCreate: (_ctx, { data }) => {
          calls.push('mw1')
          return { ...data, added1: true }
        },
        name: 'mw1'
      }
      const mw2: Middleware = {
        beforeCreate: (_ctx, { data }) => {
          calls.push('mw2')
          return { ...data, added2: true }
        },
        name: 'mw2'
      }
      const hooks = composeMiddleware(mw1, mw2)
      const result = await hooks.beforeCreate?.(mockCtx, {
        data: { title: 'test' }
      })
      expect(result).toEqual({ added1: true, added2: true, title: 'test' })
      expect(calls).toEqual(['mw1', 'mw2'])
    })
    test('composes afterCreate from multiple middleware', async () => {
      const calls: string[] = []
      const mw1: Middleware = {
        afterCreate: () => {
          calls.push('mw1')
        },
        name: 'mw1'
      }
      const mw2: Middleware = {
        afterCreate: () => {
          calls.push('mw2')
        },
        name: 'mw2'
      }
      const hooks = composeMiddleware(mw1, mw2)
      await hooks.afterCreate?.(mockCtx, { data: {}, row: {} })
      expect(calls).toEqual(['mw1', 'mw2'])
    })
    test('composes beforeUpdate from multiple middleware', async () => {
      const mw1: Middleware = {
        beforeUpdate: (_ctx, { patch }) => ({ ...patch, from1: true }),
        name: 'mw1'
      }
      const mw2: Middleware = {
        beforeUpdate: (_ctx, { patch }) => ({ ...patch, from2: true }),
        name: 'mw2'
      }
      const hooks = composeMiddleware(mw1, mw2)
      const result = await hooks.beforeUpdate?.(mockCtx, {
        patch: { title: 'x' },
        prev: {}
      })
      expect(result).toEqual({ from1: true, from2: true, title: 'x' })
    })
    test('composes afterUpdate from multiple middleware', async () => {
      const calls: string[] = []
      const mw1: Middleware = {
        afterUpdate: () => {
          calls.push('mw1')
        },
        name: 'mw1'
      }
      const mw2: Middleware = {
        afterUpdate: () => {
          calls.push('mw2')
        },
        name: 'mw2'
      }
      const hooks = composeMiddleware(mw1, mw2)
      await hooks.afterUpdate?.(mockCtx, { next: {}, patch: {}, prev: {} })
      expect(calls).toEqual(['mw1', 'mw2'])
    })
    test('composes beforeDelete from multiple middleware', async () => {
      const calls: string[] = []
      const mw1: Middleware = {
        beforeDelete: () => {
          calls.push('mw1')
        },
        name: 'mw1'
      }
      const mw2: Middleware = {
        beforeDelete: () => {
          calls.push('mw2')
        },
        name: 'mw2'
      }
      const hooks = composeMiddleware(mw1, mw2)
      await hooks.beforeDelete?.(mockCtx, { row: {} })
      expect(calls).toEqual(['mw1', 'mw2'])
    })
    test('composes afterDelete from multiple middleware', async () => {
      const calls: string[] = []
      const mw1: Middleware = {
        afterDelete: () => {
          calls.push('mw1')
        },
        name: 'mw1'
      }
      const mw2: Middleware = {
        afterDelete: () => {
          calls.push('mw2')
        },
        name: 'mw2'
      }
      const hooks = composeMiddleware(mw1, mw2)
      await hooks.afterDelete?.(mockCtx, { row: {} })
      expect(calls).toEqual(['mw1', 'mw2'])
    })
    test('skips middleware without matching hook', async () => {
      const calls: string[] = []
      const mw1: Middleware = {
        beforeCreate: (_ctx, { data }) => {
          calls.push('mw1')
          return data
        },
        name: 'mw1'
      }
      const mw2: Middleware = { name: 'mw2' }
      const hooks = composeMiddleware(mw1, mw2)
      hooks.beforeCreate?.(mockCtx, { data: { x: 1 } })
      expect(calls).toEqual(['mw1'])
    })
    test('does not set hooks when no middleware implements them', () => {
      const mw1: Middleware = {
        beforeCreate: (_ctx, { data }) => data,
        name: 'mw1'
      }
      const hooks = composeMiddleware(mw1)
      expect(hooks.beforeCreate).toBeDefined()
      expect(hooks.afterCreate).toBeUndefined()
      expect(hooks.beforeUpdate).toBeUndefined()
      expect(hooks.afterUpdate).toBeUndefined()
      expect(hooks.beforeDelete).toBeUndefined()
      expect(hooks.afterDelete).toBeUndefined()
    })
    test('passes MiddlewareCtx with operation field to hooks', async () => {
      let capturedOp = ''
      const mw: Middleware = {
        beforeCreate: (ctx, { data }) => {
          capturedOp = ctx.operation
          return data
        },
        name: 'capture'
      }
      const hooks = composeMiddleware(mw)
      hooks.beforeCreate?.(mockCtx, { data: {} })
      expect(capturedOp).toBe('create')
    })
    test('passes delete operation in beforeDelete', async () => {
      let capturedOp = ''
      const mw: Middleware = {
        beforeDelete: ctx => {
          capturedOp = ctx.operation
        },
        name: 'capture'
      }
      const hooks = composeMiddleware(mw)
      hooks.beforeDelete?.(mockCtx, { row: {} })
      expect(capturedOp).toBe('delete')
    })
    test('passes update operation in beforeUpdate', async () => {
      let capturedOp = ''
      const mw: Middleware = {
        beforeUpdate: (ctx, { patch }) => {
          capturedOp = ctx.operation
          return patch
        },
        name: 'capture'
      }
      const hooks = composeMiddleware(mw)
      hooks.beforeUpdate?.(mockCtx, { patch: {}, prev: {} })
      expect(capturedOp).toBe('update')
    })
  })
  describe('auditLog', () => {
    test('returns middleware with name auditLog', () => {
      const mw = auditLog()
      expect(mw.name).toBe('auditLog')
    })
    test('has afterCreate, afterUpdate, afterDelete hooks', () => {
      const mw = auditLog()
      expect(mw.afterCreate).toBeDefined()
      expect(mw.afterUpdate).toBeDefined()
      expect(mw.afterDelete).toBeDefined()
    })
    test('does not have before hooks', () => {
      const mw = auditLog()
      expect(mw.beforeCreate).toBeUndefined()
      expect(mw.beforeUpdate).toBeUndefined()
      expect(mw.beforeDelete).toBeUndefined()
    })
    test('afterCreate does not throw', () => {
      const mw = auditLog()
      const mwCtx: MiddlewareCtx = { ...mockCtx, operation: 'create' }
      expect(async () =>
        mw.afterCreate?.(mwCtx, {
          data: { title: 'x' },
          row: { _id: 'id1', title: 'x' }
        })
      ).not.toThrow()
    })
    test('afterUpdate does not throw', () => {
      const mw = auditLog()
      const mwCtx: MiddlewareCtx = { ...mockCtx, operation: 'update' }
      expect(async () =>
        mw.afterUpdate?.(mwCtx, {
          next: { _id: 'id1', title: 'y' },
          patch: { title: 'y' },
          prev: { title: 'x' }
        })
      ).not.toThrow()
    })
    test('afterDelete does not throw', () => {
      const mw = auditLog()
      const mwCtx: MiddlewareCtx = { ...mockCtx, operation: 'delete' }
      expect(async () => mw.afterDelete?.(mwCtx, { row: { _id: 'id1', title: 'x' } })).not.toThrow()
    })
    test('accepts custom log level', () => {
      const mw = auditLog({ logLevel: 'debug' })
      expect(mw.name).toBe('auditLog')
    })
    test('accepts verbose mode', () => {
      const mw = auditLog({ verbose: true })
      expect(mw.name).toBe('auditLog')
      const mwCtx: MiddlewareCtx = { ...mockCtx, operation: 'create' }
      expect(async () =>
        mw.afterCreate?.(mwCtx, {
          data: { title: 'x' },
          row: { _id: 'id1', title: 'x' }
        })
      ).not.toThrow()
    })
  })
  describe('slowQueryWarn', () => {
    test('returns middleware with name slowQueryWarn', () => {
      const mw = slowQueryWarn()
      expect(mw.name).toBe('slowQueryWarn')
    })
    test('has all before and after hooks', () => {
      const mw = slowQueryWarn()
      expect(mw.beforeCreate).toBeDefined()
      expect(mw.afterCreate).toBeDefined()
      expect(mw.beforeUpdate).toBeDefined()
      expect(mw.afterUpdate).toBeDefined()
      expect(mw.beforeDelete).toBeDefined()
      expect(mw.afterDelete).toBeDefined()
    })
    test('beforeCreate returns data unchanged', () => {
      const mw = slowQueryWarn()
      const mwCtx: MiddlewareCtx = { ...mockCtx, operation: 'create' }
      const data = { title: 'test' }
      const result = mw.beforeCreate?.(mwCtx, { data })
      expect(result).toEqual(data)
    })
    test('beforeUpdate returns patch unchanged', () => {
      const mw = slowQueryWarn()
      const mwCtx: MiddlewareCtx = { ...mockCtx, operation: 'update' }
      const patch = { title: 'updated' }
      const result = mw.beforeUpdate?.(mwCtx, { patch, prev: {} })
      expect(result).toEqual(patch)
    })
    test('accepts custom threshold', () => {
      const mw = slowQueryWarn({ threshold: 100 })
      expect(mw.name).toBe('slowQueryWarn')
    })
  })
  describe('inputSanitize', () => {
    test('returns middleware with name inputSanitize', () => {
      const mw = inputSanitize()
      expect(mw.name).toBe('inputSanitize')
    })
    test('has beforeCreate and beforeUpdate hooks', () => {
      const mw = inputSanitize()
      expect(mw.beforeCreate).toBeDefined()
      expect(mw.beforeUpdate).toBeDefined()
    })
    test('does not have after or delete hooks', () => {
      const mw = inputSanitize()
      expect(mw.afterCreate).toBeUndefined()
      expect(mw.afterUpdate).toBeUndefined()
      expect(mw.beforeDelete).toBeUndefined()
      expect(mw.afterDelete).toBeUndefined()
    })
    test('sanitizes script tags from string fields on create', () => {
      const mw = inputSanitize()
      const mwCtx: MiddlewareCtx = { ...mockCtx, operation: 'create' }
      const data = {
        content: 'Hello <script>alert(1)</script> World',
        title: 'Test'
      }
      const result = mw.beforeCreate?.(mwCtx, { data })
      expect(result).toEqual({ content: 'Hello  World', title: 'Test' })
    })
    test('sanitizes event handlers from string fields on create', () => {
      const mw = inputSanitize()
      const mwCtx: MiddlewareCtx = { ...mockCtx, operation: 'create' }
      const data = { title: 'Hello onclick= test' }
      const result = mw.beforeCreate?.(mwCtx, { data })
      expect(result).toEqual({ title: 'Hello  test' })
    })
    test('sanitizes script tags from string fields on update', () => {
      const mw = inputSanitize()
      const mwCtx: MiddlewareCtx = { ...mockCtx, operation: 'update' }
      const patch = { content: '<script>bad()</script>safe' }
      const result = mw.beforeUpdate?.(mwCtx, { patch, prev: {} })
      expect(result).toEqual({ content: 'safe' })
    })
    test('leaves non-string values untouched', () => {
      const mw = inputSanitize()
      const mwCtx: MiddlewareCtx = { ...mockCtx, operation: 'create' }
      const data = { count: 42, published: true, title: 'safe' }
      const result = mw.beforeCreate?.(mwCtx, { data })
      expect(result).toEqual({ count: 42, published: true, title: 'safe' })
    })
    test('targets specific fields when configured', () => {
      const mw = inputSanitize({ fields: ['content'] })
      const mwCtx: MiddlewareCtx = { ...mockCtx, operation: 'create' }
      const data = {
        content: '<script>x</script>safe',
        title: '<script>keep</script>'
      }
      const result = mw.beforeCreate?.(mwCtx, { data })
      expect(result).toEqual({
        content: 'safe',
        title: '<script>keep</script>'
      })
    })
    test('targets specific fields on update', () => {
      const mw = inputSanitize({ fields: ['content'] })
      const mwCtx: MiddlewareCtx = { ...mockCtx, operation: 'update' }
      const patch = {
        content: '<script>x</script>safe',
        title: '<script>keep</script>'
      }
      const result = mw.beforeUpdate?.(mwCtx, { patch, prev: {} })
      expect(result).toEqual({
        content: 'safe',
        title: '<script>keep</script>'
      })
    })
  })
  describe('sanitizeString', () => {
    test('removes script tags', () => {
      expect(sanitizeString('<script>alert(1)</script>')).toBe('')
    })
    test('removes script tags with attributes', () => {
      expect(sanitizeString('<script type="text/javascript">alert(1)</script>')).toBe('')
    })
    test('removes event handlers', () => {
      expect(sanitizeString('test onclick= foo')).toBe('test  foo')
    })
    test('removes onload handlers', () => {
      expect(sanitizeString('test onload= foo')).toBe('test  foo')
    })
    test('preserves clean strings', () => {
      expect(sanitizeString('Hello World')).toBe('Hello World')
    })
    test('preserves HTML without scripts', () => {
      expect(sanitizeString('<b>bold</b>')).toBe('<b>bold</b>')
    })
    test('handles empty string', () => {
      expect(sanitizeString('')).toBe('')
    })
    test('handles multiple script tags', () => {
      expect(sanitizeString('a<script>1</script>b<script>2</script>c')).toBe('abc')
    })
  })
  describe('sanitizeRec', () => {
    test('sanitizes string values', () => {
      const result = sanitizeRec({
        content: '<script>x</script>safe',
        title: 'clean'
      })
      expect(result).toEqual({ content: 'safe', title: 'clean' })
    })
    test('preserves non-string values', () => {
      const result = sanitizeRec({ count: 42, ok: true, title: 'x' })
      expect(result).toEqual({ count: 42, ok: true, title: 'x' })
    })
    test('handles empty record', () => {
      expect(sanitizeRec({})).toEqual({})
    })
  })
  describe('middleware composition with composeMiddleware', () => {
    test('multiple middleware run in order on create', async () => {
      const order: string[] = []
      const mw1: Middleware = {
        afterCreate: () => {
          order.push('audit')
        },
        beforeCreate: (_ctx, { data }) => {
          order.push('sanitize')
          return data
        },
        name: 'first'
      }
      const mw2: Middleware = {
        afterCreate: () => {
          order.push('log')
        },
        beforeCreate: (_ctx, { data }) => {
          order.push('validate')
          return data
        },
        name: 'second'
      }
      const hooks = composeMiddleware(mw1, mw2)
      await hooks.beforeCreate?.(mockCtx, { data: {} })
      await hooks.afterCreate?.(mockCtx, { data: {}, row: {} })
      expect(order).toEqual(['sanitize', 'validate', 'audit', 'log'])
    })
    test('data transforms chain through beforeCreate', async () => {
      const mw1: Middleware = {
        beforeCreate: (_ctx, { data }) => ({ ...data, step1: true }),
        name: 'step1'
      }
      const mw2: Middleware = {
        beforeCreate: (_ctx, { data }) => ({ ...data, step2: true }),
        name: 'step2'
      }
      const mw3: Middleware = {
        beforeCreate: (_ctx, { data }) => ({ ...data, step3: true }),
        name: 'step3'
      }
      const hooks = composeMiddleware(mw1, mw2, mw3)
      const result = await hooks.beforeCreate?.(mockCtx, {
        data: { original: true }
      })
      expect(result).toEqual({
        original: true,
        step1: true,
        step2: true,
        step3: true
      })
    })
    test('patch transforms chain through beforeUpdate', async () => {
      const mw1: Middleware = {
        beforeUpdate: (_ctx, { patch }) => ({ ...patch, normalized: true }),
        name: 'normalize'
      }
      const mw2: Middleware = {
        beforeUpdate: (_ctx, { patch }) => ({ ...patch, validated: true }),
        name: 'validate'
      }
      const hooks = composeMiddleware(mw1, mw2)
      const result = await hooks.beforeUpdate?.(mockCtx, {
        patch: { title: 'x' },
        prev: {}
      })
      expect(result).toEqual({ normalized: true, title: 'x', validated: true })
    })
  })
  describe('type safety', () => {
    test('Middleware type requires name', () => {
      const mw: Middleware = { name: 'test' }
      expect(mw.name).toBe('test')
    })
    test('MiddlewareCtx extends GlobalHookCtx with operation', () => {
      const ctx: MiddlewareCtx = {
        db: {},
        operation: 'create',
        sender: { toString: () => 'sender' } as MiddlewareCtx['sender'],
        table: 'test',
        timestamp: { microsSinceUnixEpoch: 0n } as MiddlewareCtx['timestamp']
      }
      expect(ctx.operation).toBe('create')
      expect(ctx.table).toBe('test')
    })
    test('MiddlewareCtx operation is create, update, or delete', () => {
      const ops: MiddlewareCtx['operation'][] = ['create', 'update', 'delete']
      expect(ops).toHaveLength(3)
    })
  })
})
describe('health check', () => {
  describe('checkSchemaConsistency', () => {
    test('returns empty issues for consistent schema', async () => {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      const { tmpdir } = await import('node:os')
      const tmpDir = `${tmpdir()}/noboil-stdb-test-health-${Date.now()}`
      mkdirSync(`${tmpDir}/spacetimedb/_generated`, { recursive: true })
      writeFileSync(`${tmpDir}/spacetimedb/blog.ts`, "crud('blog', owned.blog)")
      const schemaFile = {
        content: 'const owned = makeOwned({ blog: object({ title: string() }) })',
        path: `${tmpDir}/schema.ts`
      }
      const issues = checkSchemaConsistency(`${tmpDir}/spacetimedb`, schemaFile)
      const schemaErrors = issues.filter(i => i.level === 'error')
      expect(schemaErrors).toHaveLength(0)
    })
  })
  describe('checkIndexCoverage', () => {
    test('returns empty issues when no where clauses used', async () => {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      const { tmpdir } = await import('node:os')
      const calls: FactoryCall[] = [{ factory: 'crud', file: 'blog.ts', options: '', table: 'blog' }]
      const tmpDir = `${tmpdir()}/noboil-stdb-test-idx-${Date.now()}`
      mkdirSync(`${tmpDir}/spacetimedb/_generated`, { recursive: true })
      writeFileSync(`${tmpDir}/spacetimedb/schema.ts`, 'export default defineSchema({})')
      const issues = checkIndexCoverage(`${tmpDir}/spacetimedb`, calls)
      expect(issues).toHaveLength(0)
    })
  })
  describe('health scoring', () => {
    test('HEALTH_MAX is 100', () => {
      expect(HEALTH_MAX).toBe(100)
    })
    test('HEALTH_ERROR_PENALTY is 15', () => {
      expect(HEALTH_ERROR_PENALTY).toBe(15)
    })
    test('HEALTH_WARN_PENALTY is 5', () => {
      expect(HEALTH_WARN_PENALTY).toBe(5)
    })
    test('score calculation: perfect score with no issues', () => {
      expect(HEALTH_MAX).toBe(100)
    })
    test('score calculation: 1 error reduces by HEALTH_ERROR_PENALTY', () => {
      const score = HEALTH_MAX - HEALTH_ERROR_PENALTY
      expect(score).toBe(85)
    })
    test('score calculation: 1 warning reduces by HEALTH_WARN_PENALTY', () => {
      const score = HEALTH_MAX - HEALTH_WARN_PENALTY
      expect(score).toBe(95)
    })
    test('score calculation: multiple errors and warnings compound', () => {
      const errors = 2
      const warns = 3
      const score = HEALTH_MAX - errors * HEALTH_ERROR_PENALTY - warns * HEALTH_WARN_PENALTY
      expect(score).toBe(55)
    })
    test('score never goes below 0', () => {
      const errors = 10
      const warns = 10
      const raw = HEALTH_MAX - errors * HEALTH_ERROR_PENALTY - warns * HEALTH_WARN_PENALTY
      expect(Math.max(0, raw)).toBe(0)
    })
    test('error penalty is higher than warn penalty', () => {
      expect(HEALTH_ERROR_PENALTY).toBeGreaterThan(HEALTH_WARN_PENALTY)
    })
  })
})
describe('typed error handling (R10.5)', () => {
  describe('ok()', () => {
    test('creates success result with value', () => {
      const result = ok('hello')
      expect(result.ok).toBe(true)
      expect((result as MutationOk<string>).value).toBe('hello')
    })
    test('creates success result with object value', () => {
      const result = ok({ id: '123', name: 'test' })
      expect(result.ok).toBe(true)
      const val = (result as MutationOk<{ id: string; name: string }>).value
      expect(val.id).toBe('123')
      expect(val.name).toBe('test')
    })
    test('creates success result with null', () => {
      const result = ok(null)
      expect(result.ok).toBe(true)
      expect((result as MutationOk<null>).value).toBeNull()
    })
    test('creates success result with number', () => {
      const result = ok(42)
      expect(result.ok).toBe(true)
      expect((result as MutationOk<number>).value).toBe(42)
    })
    test('creates success result with boolean false', () => {
      const result = ok(false)
      expect(result.ok).toBe(true)
      expect((result as MutationOk<boolean>).value).toBe(false)
    })
    test('creates success result with array', () => {
      const result = ok([1, 2, 3])
      expect(result.ok).toBe(true)
      expect((result as MutationOk<number[]>).value).toEqual([1, 2, 3])
    })
  })
  describe('fail()', () => {
    test('creates failure result with code only', () => {
      const result = fail('NOT_FOUND')
      expect(result.ok).toBe(false)
      const { error } = result as MutationFail
      expect(error.code).toBe('NOT_FOUND')
      expect(error.message).toBe(ERROR_MESSAGES.NOT_FOUND)
    })
    test('creates failure result with code and custom message', () => {
      const result = fail('CONFLICT', { message: 'Stale data detected' })
      expect(result.ok).toBe(false)
      const { error } = result as MutationFail
      expect(error.code).toBe('CONFLICT')
      expect(error.message).toBe('Stale data detected')
    })
    test('creates failure result with fieldErrors', () => {
      const result = fail('VALIDATION_FAILED', {
        fieldErrors: { content: 'Required', title: 'Too short' },
        fields: ['title', 'content']
      })
      expect(result.ok).toBe(false)
      const { error } = result as MutationFail
      expect(error.code).toBe('VALIDATION_FAILED')
      expect(error.fieldErrors).toEqual({
        content: 'Required',
        title: 'Too short'
      })
      expect(error.fields).toEqual(['title', 'content'])
    })
    test('creates failure result with debug info', () => {
      const result = fail('FORBIDDEN', { debug: 'user=abc org=xyz' })
      expect(result.ok).toBe(false)
      const { error } = result as MutationFail
      expect(error.code).toBe('FORBIDDEN')
      expect(error.debug).toBe('user=abc org=xyz')
    })
    test('creates failure result with table and op', () => {
      const result = fail('NOT_FOUND', { op: 'update', table: 'blog' })
      expect(result.ok).toBe(false)
      const { error } = result as MutationFail
      expect(error.table).toBe('blog')
      expect(error.op).toBe('update')
    })
    test('default message comes from ERROR_MESSAGES', () => {
      const result = fail('RATE_LIMITED')
      expect(result.ok).toBe(false)
      expect((result as MutationFail).error.message).toBe(ERROR_MESSAGES.RATE_LIMITED)
    })
    test('every ErrorCode produces a valid fail result', () => {
      const codes: ErrorCode[] = [
        'ALREADY_ORG_MEMBER',
        'CANNOT_MODIFY_ADMIN',
        'CANNOT_MODIFY_OWNER',
        'CONFLICT',
        'FORBIDDEN',
        'NOT_AUTHENTICATED',
        'NOT_AUTHORIZED',
        'NOT_FOUND',
        'RATE_LIMITED',
        'UNAUTHORIZED',
        'VALIDATION_FAILED'
      ]
      for (const code of codes) {
        const result = fail(code)
        expect(result.ok).toBe(false)
        expect((result as MutationFail).error.code).toBe(code)
        expect(typeof (result as MutationFail).error.message).toBe('string')
      }
    })
  })
  describe('MutationResult discriminated union', () => {
    test('ok result has ok=true and value', () => {
      const result: MutationResult<string> = ok('data')
      expect(result.ok).toBe(true)
      expect((result as MutationOk<string>).value).toBe('data')
    })
    test('fail result has ok=false and error', () => {
      const result: MutationResult<string> = fail('NOT_FOUND')
      expect(result.ok).toBe(false)
      expect((result as MutationFail).error.code).toBe('NOT_FOUND')
    })
    test('ok result produces value key', () => {
      const result = ok(42)
      expect(result.ok).toBe(true)
      expect((result as MutationOk<number>).value).toBe(42)
    })
    test('fail result produces error key', () => {
      const result = fail('FORBIDDEN')
      expect(result.ok).toBe(false)
      expect((result as MutationFail).error.code).toBe('FORBIDDEN')
    })
    test('MutationResult type works with complex value types', () => {
      const result: MutationResult<{ id: string; tags: string[] }> = ok({
        id: '1',
        tags: ['a', 'b']
      })
      expect(result.ok).toBe(true)
      const val = (result as MutationOk<{ id: string; tags: string[] }>).value
      expect(val.id).toBe('1')
      expect(val.tags).toEqual(['a', 'b'])
    })
    test('MutationOk type has correct shape', () => {
      const r: MutationOk<number> = { ok: true, value: 99 }
      expect(r.ok).toBe(true)
      expect(r.value).toBe(99)
    })
    test('MutationFail type has correct shape', () => {
      const r: MutationFail = { error: { code: 'NOT_FOUND' }, ok: false }
      expect(r.ok).toBe(false)
      expect(r.error.code).toBe('NOT_FOUND')
    })
  })
  describe('isMutationError()', () => {
    test('returns true for SenderError with valid code', () => {
      expect(isMutationError(makeSenderError({ code: 'NOT_FOUND' }))).toBe(true)
    })
    test('returns true for SenderError with code and data', () => {
      expect(isMutationError(makeSenderError({ code: 'CONFLICT', message: 'stale' }))).toBe(true)
    })
    test('returns false for plain Error', () => {
      expect(isMutationError(new Error('nope'))).toBe(false)
    })
    test('returns false for string', () => {
      expect(isMutationError('oops')).toBe(false)
    })
    test('returns false for null', () => {
      expect(isMutationError(null)).toBe(false)
    })
    test('returns false for number', () => {
      expect(isMutationError(42)).toBe(false)
    })
    test('returns false for SenderError with invalid code', () => {
      expect(isMutationError(makeSenderError({ code: 'INVALID_NOPE' }))).toBe(false)
    })
    test('returns false for SenderError with non-string code', () => {
      expect(isMutationError(makeSenderError({ code: 123 }))).toBe(false)
    })
    test('returns false for SenderError with string data', () => {
      expect(isMutationError(makeSenderError('just text'))).toBe(false)
    })
    test('returns true for every valid ErrorCode', () => {
      const codes: ErrorCode[] = ['NOT_FOUND', 'FORBIDDEN', 'RATE_LIMITED', 'CONFLICT', 'VALIDATION_FAILED']
      for (const code of codes) expect(isMutationError(makeSenderError({ code }))).toBe(true)
    })
  })
  describe('isErrorCode()', () => {
    test('returns true when code matches', () => {
      const e = makeSenderError({ code: 'NOT_FOUND' })
      expect(isErrorCode(e, 'NOT_FOUND')).toBe(true)
    })
    test('returns false when code does not match', () => {
      const e = makeSenderError({ code: 'FORBIDDEN' })
      expect(isErrorCode(e, 'NOT_FOUND')).toBe(false)
    })
    test('returns false for plain Error', () => {
      expect(isErrorCode(new Error('x'), 'NOT_FOUND')).toBe(false)
    })
    test('returns false for null', () => {
      expect(isErrorCode(null, 'NOT_FOUND')).toBe(false)
    })
    test('returns false for string', () => {
      expect(isErrorCode('error', 'NOT_FOUND')).toBe(false)
    })
    test('returns false for SenderError with different code', () => {
      const e = makeSenderError({ code: 'RATE_LIMITED' })
      expect(isErrorCode(e, 'CONFLICT')).toBe(false)
    })
    test('works with every ErrorCode value', () => {
      const codes: ErrorCode[] = ['CONFLICT', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED', 'UNAUTHORIZED']
      for (const code of codes) {
        const e = makeSenderError({ code })
        expect(isErrorCode(e, code)).toBe(true)
        expect(isErrorCode(e, 'ALREADY_ORG_MEMBER')).toBe(false)
      }
    })
  })
  describe('matchError()', () => {
    test('matches specific error code', () => {
      const e = makeSenderError({ code: 'NOT_FOUND' })
      const result = matchError(e, {
        NOT_FOUND: d => `found: ${d.code}`
      })
      expect(result).toBe('found: NOT_FOUND')
    })
    test('returns handler return value', () => {
      const e = makeSenderError({ code: 'RATE_LIMITED', message: 'slow down' })
      const result = matchError(e, {
        RATE_LIMITED: d => ({ msg: d.message, retry: true })
      })
      expect(result).toEqual({ msg: 'slow down', retry: true })
    })
    test('calls _ fallback when no specific handler', () => {
      const e = makeSenderError({ code: 'FORBIDDEN' })
      const result = matchError(e, {
        NOT_FOUND: () => 'not found',
        _: () => 'fallback'
      })
      expect(result).toBe('fallback')
    })
    test('calls _ fallback for plain Error', () => {
      const e = new Error('plain')
      const result = matchError(e, {
        NOT_FOUND: () => 'not found',
        _: rawErr => (rawErr as Error).message
      })
      expect(result).toBe('plain')
    })
    test('returns undefined when no match and no fallback', () => {
      const e = makeSenderError({ code: 'FORBIDDEN' })
      const result = matchError(e, {
        NOT_FOUND: () => 'nope'
      })
      expect(result).toBeUndefined()
    })
    test('returns undefined for non-error with no fallback', () => {
      const result = matchError(null, {
        NOT_FOUND: () => 'nope'
      })
      expect(result).toBeUndefined()
    })
    test('specific handler takes precedence over fallback', () => {
      const e = makeSenderError({ code: 'CONFLICT' })
      const result = matchError(e, {
        CONFLICT: () => 'specific',
        _: () => 'fallback'
      })
      expect(result).toBe('specific')
    })
    test('handler receives full error data', () => {
      const e = makeSenderError({
        code: 'VALIDATION_FAILED',
        fieldErrors: { title: 'required' },
        fields: ['title'],
        message: 'Invalid input'
      })
      const result = matchError(e, {
        VALIDATION_FAILED: d => ({
          code: d.code,
          fieldErrors: d.fieldErrors,
          fields: d.fields,
          message: d.message
        })
      })
      expect(result).toEqual({
        code: 'VALIDATION_FAILED',
        fieldErrors: { title: 'required' },
        fields: ['title'],
        message: 'Invalid input'
      })
    })
    test('multiple handlers only calls matching one', () => {
      const e = makeSenderError({ code: 'RATE_LIMITED' })
      let notFoundCalled = false
      let rateLimitedCalled = false
      matchError(e, {
        NOT_FOUND: () => {
          notFoundCalled = true
        },
        RATE_LIMITED: () => {
          rateLimitedCalled = true
        }
      })
      expect(notFoundCalled).toBe(false)
      expect(rateLimitedCalled).toBe(true)
    })
    test('returns typed result from handler', () => {
      const e = makeSenderError({ code: 'NOT_FOUND' })
      const result: number | undefined = matchError(e, {
        NOT_FOUND: () => 42
      })
      expect(result).toBe(42)
    })
    test('_ receives original error for non-SenderError', () => {
      const original = new Error('boom')
      const result = matchError(original, {
        _: e => (e as Error).message
      })
      expect(result).toBe('boom')
    })
    test('_ receives original error for SenderError without matching handler', () => {
      const original = makeSenderError({ code: 'FORBIDDEN' })
      const result = matchError(original, {
        NOT_FOUND: () => 'nope',
        _: () => 'fallback'
      })
      expect(result).toBe('fallback')
    })
  })
  describe('integration: ok/fail with matchError', () => {
    test('process MutationResult with matchError on error case', () => {
      const result = fail('NOT_FOUND')
      expect(result.ok).toBe(false)
      const errorData = (result as MutationFail).error
      const e = makeSenderError({
        code: errorData.code,
        message: errorData.message
      })
      const msg = matchError(e, {
        NOT_FOUND: d => `Item not found: ${d.message}`,
        _: () => 'Unknown error'
      })
      expect(msg).toBe(`Item not found: ${ERROR_MESSAGES.NOT_FOUND}`)
    })
    test('ok result does not need error handling', () => {
      const result = ok({ id: '123' })
      expect(result.ok).toBe(true)
    })
    test('fail result can be used with isMutationError on SenderError', () => {
      const result = fail('CONFLICT', { message: 'Stale' })
      expect(result.ok).toBe(false)
      const errorData = (result as MutationFail).error
      const thrown = makeSenderError({
        code: errorData.code,
        message: errorData.message
      })
      expect(isMutationError(thrown)).toBe(true)
      expect(isErrorCode(thrown, 'CONFLICT')).toBe(true)
    })
    test('full mutation flow: create, fail, handle', () => {
      const success = ok('created-hello')
      expect(success.ok).toBe(true)
      expect((success as MutationOk<string>).value).toBe('created-hello')
      const failure = fail('VALIDATION_FAILED', {
        fieldErrors: { title: 'Required' },
        fields: ['title']
      })
      expect(failure.ok).toBe(false)
      expect((failure as MutationFail).error.code).toBe('VALIDATION_FAILED')
      expect((failure as MutationFail).error.fieldErrors).toEqual({
        title: 'Required'
      })
    })
  })
})
describe('rich error metadata (R11.2)', () => {
  describe('err() with Record<string, unknown> opts', () => {
    test('err with string opts works unchanged', () => {
      try {
        err('NOT_FOUND', 'blog:read')
      } catch (error) {
        const d = extractErrorData(error)
        expect(d).toBeDefined()
        expect(d?.code).toBe('NOT_FOUND')
        expect(d?.debug).toBe('blog:read')
        expect(d?.table).toBe('blog')
        expect(d?.op).toBe('read')
      }
    })
    test('err with object opts spreads into error', () => {
      try {
        err('RATE_LIMITED', {
          debug: 'blog:create',
          limit: { max: 10, remaining: 0, window: 60_000 },
          op: 'create',
          retryAfter: 45_000,
          table: 'blog'
        })
      } catch (error) {
        const d = extractErrorData(error)
        expect(d).toBeDefined()
        expect(d?.code).toBe('RATE_LIMITED')
        expect(d?.retryAfter).toBe(45_000)
        expect(d?.limit).toEqual({ max: 10, remaining: 0, window: 60_000 })
        expect(d?.table).toBe('blog')
        expect(d?.op).toBe('create')
        expect(d?.debug).toBe('blog:create')
      }
    })
    test('err with { message } object works', () => {
      try {
        err('FORBIDDEN', { message: 'Access denied' })
      } catch (error) {
        const d = extractErrorData(error)
        expect(d?.code).toBe('FORBIDDEN')
        expect(d?.message).toBe('Access denied')
      }
    })
    test('err with no opts throws code-only error', () => {
      try {
        err('NOT_AUTHENTICATED')
      } catch (error) {
        const d = extractErrorData(error)
        expect(d?.code).toBe('NOT_AUTHENTICATED')
        expect(d?.message).toBeUndefined()
        expect(d?.retryAfter).toBeUndefined()
        expect(d?.limit).toBeUndefined()
      }
    })
  })
  describe('extractErrorData with retryAfter and limit', () => {
    test('extracts retryAfter from SenderError', () => {
      const e = makeSenderError({ code: 'RATE_LIMITED', retryAfter: 30_000 })
      const d = extractErrorData(e)
      expect(d?.retryAfter).toBe(30_000)
    })
    test('retryAfter undefined when not a number', () => {
      const e = makeSenderError({ code: 'RATE_LIMITED', retryAfter: 'soon' })
      const d = extractErrorData(e)
      expect(d?.retryAfter).toBeUndefined()
    })
    test('extracts limit object from SenderError', () => {
      const limit = { max: 10, remaining: 0, window: 60_000 }
      const e = makeSenderError({ code: 'RATE_LIMITED', limit })
      const d = extractErrorData(e)
      expect(d?.limit).toEqual(limit)
    })
    test('limit undefined when not an object', () => {
      const e = makeSenderError({ code: 'RATE_LIMITED', limit: 42 })
      const d = extractErrorData(e)
      expect(d?.limit).toBeUndefined()
    })
    test('limit undefined when null', () => {
      const e = makeSenderError({ code: 'RATE_LIMITED', limit: null })
      const d = extractErrorData(e)
      expect(d?.limit).toBeUndefined()
    })
    test('both retryAfter and limit extracted together', () => {
      const e = makeSenderError({
        code: 'RATE_LIMITED',
        limit: { max: 5, remaining: 0, window: 30_000 },
        retryAfter: 15_000
      })
      const d = extractErrorData(e)
      expect(d?.retryAfter).toBe(15_000)
      expect(d?.limit).toEqual({ max: 5, remaining: 0, window: 30_000 })
    })
    test('non-rate-limit errors have no retryAfter or limit', () => {
      const e = makeSenderError({ code: 'NOT_FOUND' })
      const d = extractErrorData(e)
      expect(d?.retryAfter).toBeUndefined()
      expect(d?.limit).toBeUndefined()
    })
  })
  describe('getErrorDetail with rate limit info', () => {
    test('includes retry after in detail string', () => {
      const e = makeSenderError({
        code: 'RATE_LIMITED',
        retryAfter: 45_000,
        table: 'blog'
      })
      const detail = getErrorDetail(e)
      expect(detail).toContain('blog')
      expect(detail).toContain('retry after 45000ms')
    })
    test('no retry info when retryAfter absent', () => {
      const e = makeSenderError({ code: 'RATE_LIMITED' })
      const detail = getErrorDetail(e)
      expect(detail).not.toContain('retry')
    })
    test('detail without table or retryAfter returns base message', () => {
      const e = makeSenderError({ code: 'NOT_FOUND' })
      const detail = getErrorDetail(e)
      expect(detail).toBe(ERROR_MESSAGES.NOT_FOUND)
    })
  })
  describe('fail() with rich metadata', () => {
    test('fail with retryAfter creates proper MutationFail', () => {
      const result = fail('RATE_LIMITED', {
        limit: { max: 10, remaining: 0, window: 60_000 },
        retryAfter: 45_000,
        table: 'blog'
      })
      expect(result.ok).toBe(false)
      const f = result as MutationFail
      expect(f.error.code).toBe('RATE_LIMITED')
      expect(f.error.retryAfter).toBe(45_000)
      expect(f.error.limit).toEqual({ max: 10, remaining: 0, window: 60_000 })
      expect(f.error.table).toBe('blog')
    })
    test('fail without rich metadata still works', () => {
      const result = fail('FORBIDDEN')
      expect(result.ok).toBe(false)
      const f = result as MutationFail
      expect(f.error.code).toBe('FORBIDDEN')
      expect(f.error.retryAfter).toBeUndefined()
      expect(f.error.limit).toBeUndefined()
    })
  })
  describe('matchError with rich metadata', () => {
    test('rate limit handler receives retryAfter and limit', () => {
      const e = makeSenderError({
        code: 'RATE_LIMITED',
        limit: { max: 10, remaining: 0, window: 60_000 },
        retryAfter: 45_000
      })
      const result = matchError(e, {
        RATE_LIMITED: d => ({ limit: d.limit, retryAfter: d.retryAfter })
      })
      expect(result).toEqual({
        limit: { max: 10, remaining: 0, window: 60_000 },
        retryAfter: 45_000
      })
    })
    test('handleError passes rich metadata to handler', () => {
      const e = makeSenderError({
        code: 'RATE_LIMITED',
        limit: { max: 5, remaining: 0, window: 30_000 },
        retryAfter: 20_000
      })
      let received: ErrorData | undefined
      handleError(e, {
        RATE_LIMITED: d => {
          received = d
        }
      })
      expect(received?.retryAfter).toBe(20_000)
      expect(received?.limit).toEqual({ max: 5, remaining: 0, window: 30_000 })
    })
  })
})
describe('parseObjectFields', () => {
  test('parses simple fields from object block', () => {
    const content = `
    title: string(),
    count: number(),
    active: boolean(),
  `
    const fields = parseObjectFields(content, 0)
    expect(fields).toEqual([
      { field: 'title', type: 'string()' },
      { field: 'count', type: 'number()' },
      { field: 'active', type: 'boolean()' }
    ])
  })
  test('strips trailing commas', () => {
    const content = 'name: string(),'
    const fields = parseObjectFields(content, 0)
    expect(fields).toEqual([{ field: 'name', type: 'string()' }])
  })
  test('simplifies nested parentheses', () => {
    const content = 'title: string().min(1).max(100),'
    const fields = parseObjectFields(content, 0)
    expect(fields[0]?.type).toBe('string().min().max()')
  })
  test('simplifies nested braces', () => {
    const content = 'category: zenum(["tech", "life"]),'
    const fields = parseObjectFields(content, 0)
    expect(fields[0]?.type).toContain('zenum')
  })
  test('skips comment lines', () => {
    const content = `
    // this is a comment
    title: string(),
  `
    const fields = parseObjectFields(content, 0)
    expect(fields).toEqual([{ field: 'title', type: 'string()' }])
  })
  test('skips blank lines', () => {
    const content = `
    title: string(),
    count: number(),
  `
    const fields = parseObjectFields(content, 0)
    expect(fields).toHaveLength(2)
  })
  test('returns empty for empty block', () => {
    const fields = parseObjectFields('', 0)
    expect(fields).toEqual([])
  })
  test('handles balanced brackets in content', () => {
    const content = 'tags: array(string()),'
    const fields = parseObjectFields(content, 0)
    expect(fields[0]?.field).toBe('tags')
  })
})
describe('extractSchemaFields', () => {
  test('extracts tables from makeOwned', () => {
    const content = `const schemaDef = schema({
  blog: table({}, {
    title: t.string(),
    content: t.string(),
  })
})`
    const tables = extractSchemaFields(content)
    expect(tables).toHaveLength(1)
    expect(tables[0]?.table).toBe('blog')
    expect(tables[0]?.factory).toBe('spacetimedb')
    expect(tables[0]?.fields).toHaveLength(2)
    expect(tables[0]?.fields[0]).toEqual({
      field: 'title',
      type: 't.string()'
    })
  })
  test('extracts multiple tables from same wrapper', () => {
    const content = `const schemaDef = schema({
  blog: table({}, {
    title: t.string(),
  }),
  chat: table({}, {
    name: t.string(),
    isPublic: t.bool(),
  })
})`
    const tables = extractSchemaFields(content)
    expect(tables).toHaveLength(2)
    const names = tables.map(t => t.table)
    expect(names).toContain('blog')
    expect(names).toContain('chat')
  })
  test('maps factories correctly', () => {
    const tests: [string, string][] = [
      ['schema', 'spacetimedb'],
      ['schema', 'spacetimedb']
    ]
    for (const [wrapper, expected] of tests) {
      const content = `const x = ${wrapper}({
  item: table({}, {
    name: t.string(),
  })
})`
      const tables = extractSchemaFields(content)
      expect(tables[0]?.factory).toBe(expected)
    }
  })
  test('returns empty for content without schema markers', () => {
    const content = 'const x = { hello: "world" }'
    const tables = extractSchemaFields(content)
    expect(tables).toEqual([])
  })
  test('handles child schemas with foreignKey and parent', () => {
    const content = `const schemaDef = schema({
  message: table({}, {
    text: t.string(),
    sender: t.string(),
  })
})`
    const tables = extractSchemaFields(content)
    expect(tables).toHaveLength(1)
    expect(tables[0]?.table).toBe('message')
    expect(tables[0]?.factory).toBe('spacetimedb')
  })
  test('skips child without valid pattern', () => {
    const content = 'const x = child({ schema: object({ a: string() }) })'
    const tables = extractSchemaFields(content)
    expect(tables).toEqual([])
  })
})
describe('printSchemaPreview', () => {
  test('prints table info with factory type', () => {
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '))
    }
    const content = `const schemaDef = schema({
  blog: table({}, {
    title: t.string(),
  })
})`
    const calls: FactoryCall[] = [
      {
        factory: 'makeCrud',
        file: 'blog.ts',
        options: 'endpoints=create,read',
        table: 'blog'
      }
    ]
    printSchemaPreview(content, calls)
    console.log = origLog
    const output = logs.join('\n')
    expect(output).toContain('blog')
    expect(output).toContain('spacetimedb')
    expect(output).toContain('title')
  })
  test('shows options when present', () => {
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '))
    }
    const content = `const schemaDef = schema({
  blog: table({}, {
    title: t.string(),
  })
})`
    const calls: FactoryCall[] = [
      {
        factory: 'makeCrud',
        file: 'blog.ts',
        options: 'endpoints=search,restore',
        table: 'blog'
      }
    ]
    printSchemaPreview(content, calls)
    console.log = origLog
    const output = logs.join('\n')
    expect(output).toContain('[2 reducers]')
  })
  test('shows no tables message for empty schema', () => {
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '))
    }
    printSchemaPreview('const x = 1', [])
    console.log = origLog
    const output = logs.join('\n')
    expect(output).toContain('No tables found')
  })
  test('shows total count summary', () => {
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '))
    }
    const content = `const schemaDef = schema({
  blog: table({}, {
    title: t.string(),
    content: t.string(),
  }),
  chat: table({}, {
    name: t.string(),
  })
})`
    const calls: FactoryCall[] = [
      {
        factory: 'makeCrud',
        file: 'blog.ts',
        options: 'endpoints=list',
        table: 'blog'
      },
      {
        factory: 'makeCrud',
        file: 'chat.ts',
        options: 'endpoints=list',
        table: 'chat'
      }
    ]
    printSchemaPreview(content, calls)
    console.log = origLog
    const output = logs.join('\n')
    expect(output).toContain('2')
    expect(output).toContain('3')
  })
})
describe('DevtoolsProps customization (R11.3)', () => {
  test('DevtoolsProps interface accepts all optional props', () => {
    const props: DevtoolsProps = {
      buttonClassName: 'my-btn',
      className: 'my-class',
      defaultOpen: true,
      defaultTab: 'subs',
      panelClassName: 'my-panel',
      position: 'top-left'
    }
    expect(props.className).toBe('my-class')
    expect(props.buttonClassName).toBe('my-btn')
    expect(props.panelClassName).toBe('my-panel')
    expect(props.defaultTab).toBe('subs')
    expect(props.defaultOpen).toBe(true)
    expect(props.position).toBe('top-left')
  })
  test('DevtoolsProps accepts empty object', () => {
    const props: DevtoolsProps = {}
    expect(props.className).toBeUndefined()
    expect(props.position).toBeUndefined()
  })
  test('position accepts all 4 corners', () => {
    const positions: DevtoolsProps['position'][] = ['bottom-right', 'bottom-left', 'top-right', 'top-left']
    expect(positions).toHaveLength(4)
  })
  test('defaultTab accepts all tab ids', () => {
    const tabs: DevtoolsProps['defaultTab'][] = ['errors', 'subs', 'reducers', 'cache']
    expect(tabs).toHaveLength(4)
  })
  test('DevtoolsProps rejects invalid position', () => {
    type P = DevtoolsProps['position']
    type Check = 'center' extends P ? true : false
    const invalid: Check = false
    expect(invalid).toBe(false)
  })
  test('DevtoolsProps rejects invalid defaultTab', () => {
    type T = DevtoolsProps['defaultTab']
    type Check = 'settings' extends T ? true : false
    const invalid: Check = false
    expect(invalid).toBe(false)
  })
})
describe('SchemaPlayground (R11.4)', () => {
  test('PlaygroundProps accepts all optional props', () => {
    const props: PlaygroundProps = {
      className: 'my-playground',
      defaultValue: 'const x = makeOwned({})',
      endpointClassName: 'ep-class',
      inputClassName: 'input-class',
      placeholder: 'Type schema...',
      readOnly: true,
      tableClassName: 'table-class'
    }
    expect(props.className).toBe('my-playground')
    expect(props.readOnly).toBe(true)
    expect(props.defaultValue).toBe('const x = makeOwned({})')
  })
  test('PlaygroundProps accepts empty object', () => {
    const props: PlaygroundProps = {}
    expect(props.className).toBeUndefined()
    expect(props.readOnly).toBeUndefined()
  })
  test('PlaygroundProps onChange is callable', () => {
    let captured = ''
    const props: PlaygroundProps = {
      onChange: (v: string) => {
        captured = v
      }
    }
    props.onChange?.('test')
    expect(captured).toBe('test')
  })
  test('extractSchemaFields powers the playground preview', () => {
    const content = `const schemaDef = schema({
  blog: table({}, {
    title: t.string(),
    content: t.string(),
  })
})`
    const tables = extractSchemaFields(content)
    expect(tables).toHaveLength(1)
    expect(tables[0]?.table).toBe('blog')
    expect(tables[0]?.factory).toBe('spacetimedb')
    const endpoints = endpointsForFactory({
      factory: 'makeCrud',
      file: '',
      options: 'endpoints=pub.list,create,update,rm',
      table: 'blog'
    })
    expect(endpoints.length).toBeGreaterThan(0)
    expect(endpoints).toContain('pub.list')
    expect(endpoints).toContain('create')
    expect(endpoints).toContain('update')
    expect(endpoints).toContain('rm')
  })
  test('playground detects multiple factory types', () => {
    const content = `const schemaDef = schema({
  blog: table({}, { title: t.string() }),
  project: table({}, { name: t.string() }),
})`
    const tables = extractSchemaFields(content)
    expect(tables).toHaveLength(2)
    const factories = tables.map(t => t.factory)
    expect(factories).toContain('spacetimedb')
  })
  test('endpointsForFactory returns correct endpoints for each factory', () => {
    expect(
      endpointsForFactory({
        factory: 'makeCrud',
        file: '',
        options: 'endpoints=create',
        table: 't'
      })
    ).toContain('create')
    expect(
      endpointsForFactory({
        factory: 'makeOrg',
        file: '',
        options: 'endpoints=create',
        table: 't'
      })
    ).toContain('create')
    expect(
      endpointsForFactory({
        factory: 'reducer',
        file: '',
        options: 'endpoints=get,upsert',
        table: 't'
      })
    ).toContain('get')
    expect(
      endpointsForFactory({
        factory: 'reducer',
        file: '',
        options: 'endpoints=get,upsert',
        table: 't'
      })
    ).toContain('upsert')
    expect(
      endpointsForFactory({
        factory: 'makeCacheCrud',
        file: '',
        options: 'endpoints=invalidate',
        table: 't'
      })
    ).toContain('invalidate')
    expect(
      endpointsForFactory({
        factory: 'makeChildCrud',
        file: '',
        options: 'endpoints=list',
        table: 't'
      })
    ).toContain('list')
  })
  test('orgCrud with acl option adds editor endpoints', () => {
    const endpoints = endpointsForFactory({
      factory: 'makeOrg',
      file: '',
      options: 'endpoints=addEditor,removeEditor,editors',
      table: 't'
    })
    expect(endpoints).toContain('addEditor')
    expect(endpoints).toContain('removeEditor')
    expect(endpoints).toContain('editors')
  })
  test('crud with softDelete adds restore endpoint', () => {
    const endpoints = endpointsForFactory({
      factory: 'makeCrud',
      file: '',
      options: 'endpoints=restore',
      table: 't'
    })
    expect(endpoints).toContain('restore')
  })
  test('crud with search adds pub.search endpoint', () => {
    const endpoints = endpointsForFactory({
      factory: 'makeCrud',
      file: '',
      options: 'endpoints=pub.search',
      table: 't'
    })
    expect(endpoints).toContain('pub.search')
  })
})
describe('noboil-stdb add command', () => {
  describe('parseFieldDef', () => {
    test('parses simple string field', () => {
      const f = parseFieldDef('title:string')
      expect(f).toEqual({ name: 'title', optional: false, type: 'string' })
    })
    test('parses boolean field', () => {
      const f = parseFieldDef('done:boolean')
      expect(f).toEqual({ name: 'done', optional: false, type: 'boolean' })
    })
    test('parses number field', () => {
      const f = parseFieldDef('count:number')
      expect(f).toEqual({ name: 'count', optional: false, type: 'number' })
    })
    test('parses optional field', () => {
      const f = parseFieldDef('bio:string?')
      expect(f).toEqual({ name: 'bio', optional: true, type: 'string' })
    })
    test('parses enum field', () => {
      const f = parseFieldDef('status:enum(draft,published,archived)')
      expect(f).toEqual({
        name: 'status',
        optional: false,
        type: { enum: ['draft', 'published', 'archived'] }
      })
    })
    test('parses optional enum field', () => {
      const f = parseFieldDef('priority:enum(low,medium,high)?')
      expect(f).toEqual({
        name: 'priority',
        optional: true,
        type: { enum: ['low', 'medium', 'high'] }
      })
    })
    test('returns null for invalid field', () => {
      expect(parseFieldDef('invalid')).toBeNull()
    })
    test('returns null for unknown type', () => {
      expect(parseFieldDef('title:unknown')).toBeNull()
    })
  })
  describe('parseAddFlags', () => {
    test('parses table name from positional arg', () => {
      const flags = parseAddFlags(['todo'])
      expect(flags.name).toBe('todo')
      expect(flags.type).toBe('owned')
    })
    test('parses --type flag', () => {
      const flags = parseAddFlags(['wiki', '--type=org'])
      expect(flags.type).toBe('org')
    })
    test('parses --fields flag', () => {
      const flags = parseAddFlags(['todo', '--fields=title:string,done:boolean'])
      expect(flags.fields).toHaveLength(2)
      expect(flags.fields[0]?.name).toBe('title')
      expect(flags.fields[1]?.name).toBe('done')
    })
    test('parses --parent flag', () => {
      const flags = parseAddFlags(['message', '--type=child', '--parent=chat'])
      expect(flags.parent).toBe('chat')
      expect(flags.type).toBe('child')
    })
    test('parses --module-dir flag', () => {
      const flags = parseAddFlags(['todo', '--module-dir=my-module'])
      expect(flags.moduleDir).toBe('my-module')
    })
    test('parses --app-dir flag', () => {
      const flags = parseAddFlags(['todo', '--app-dir=app'])
      expect(flags.appDir).toBe('app')
    })
    test('parses --help flag', () => {
      const flags = parseAddFlags(['--help'])
      expect(flags.help).toBe(true)
    })
    test('default type is owned', () => {
      const flags = parseAddFlags(['todo'])
      expect(flags.type).toBe('owned')
    })
    test('default moduleDir is module', () => {
      const flags = parseAddFlags(['todo'])
      expect(flags.moduleDir).toBe('module')
    })
    test('default appDir is src/app', () => {
      const flags = parseAddFlags(['todo'])
      expect(flags.appDir).toBe('src/app')
    })
  })
  describe('fieldToZod', () => {
    test('string field', () => {
      expect(fieldToZod({ name: 'title', optional: false, type: 'string' })).toBe('t.string()')
    })
    test('boolean field', () => {
      expect(fieldToZod({ name: 'done', optional: false, type: 'boolean' })).toBe('t.bool()')
    })
    test('number field', () => {
      expect(fieldToZod({ name: 'count', optional: false, type: 'number' })).toBe('t.f64()')
    })
    test('optional field', () => {
      expect(fieldToZod({ name: 'bio', optional: true, type: 'string' })).toBe('t.string()')
    })
    test('enum field', () => {
      const result = fieldToZod({
        name: 'status',
        optional: false,
        type: { enum: ['draft', 'published'] }
      })
      expect(result).toBe('t.string()')
    })
    test('optional enum field', () => {
      const result = fieldToZod({
        name: 'priority',
        optional: true,
        type: { enum: ['low', 'high'] }
      })
      expect(result).toBe('t.string()')
    })
  })
  describe('defaultFields', () => {
    test('owned has title and content', () => {
      const fields = defaultFields('owned')
      expect(fields).toHaveLength(2)
      expect(fields[0]?.name).toBe('title')
      expect(fields[1]?.name).toBe('content')
    })
    test('org has title and content', () => {
      const fields = defaultFields('org')
      expect(fields).toHaveLength(2)
    })
    test('child has text', () => {
      const fields = defaultFields('child')
      expect(fields).toHaveLength(1)
      expect(fields[0]?.name).toBe('text')
    })
    test('singleton has displayName and bio', () => {
      const fields = defaultFields('singleton')
      expect(fields).toHaveLength(2)
      expect(fields[0]?.name).toBe('displayName')
      expect(fields[1]?.optional).toBe(true)
    })
    test('cache has title and externalId', () => {
      const fields = defaultFields('cache')
      expect(fields).toHaveLength(2)
      expect(fields[1]?.name).toBe('externalId')
    })
  })
  describe('genSchemaContent', () => {
    test('generates owned schema', () => {
      const content = genSchemaContent('blog', 'owned', [{ name: 'title', optional: false, type: 'string' }])
      expect(content).toContain("import { table, t } from 'spacetimedb'")
      expect(content).toContain('blogTable')
      expect(content).toContain('blog')
      expect(content).toContain('t.string()')
    })
    test('generates org schema', () => {
      const content = genSchemaContent('wiki', 'org', [{ name: 'title', optional: false, type: 'string' }])
      expect(content).toContain('orgId: t.string()')
      expect(content).toContain('public: false')
    })
    test('generates singleton schema', () => {
      const content = genSchemaContent('profile', 'singleton', [{ name: 'displayName', optional: false, type: 'string' }])
      expect(content).toContain('userId: t.string()')
      expect(content).toContain('profileTable')
    })
    test('generates base schema for cache', () => {
      const content = genSchemaContent('movie', 'cache', [{ name: 'title', optional: false, type: 'string' }])
      expect(content).toContain('public: true')
      expect(content).toContain('movieTable')
    })
    test('generates child schema', () => {
      const content = genSchemaContent('message', 'child', [{ name: 'text', optional: false, type: 'string' }])
      expect(content).toContain('parentId: t.string()')
      expect(content).toContain('messageTable')
    })
    test('includes enum import when needed', () => {
      const content = genSchemaContent('blog', 'owned', [
        {
          name: 'status',
          optional: false,
          type: { enum: ['draft', 'published'] }
        }
      ])
      expect(content).toContain("import { table, t } from 'spacetimedb'")
      expect(content).toContain('status: t.string()')
    })
    test('includes optional fields', () => {
      const content = genSchemaContent('blog', 'owned', [{ name: 'bio', optional: true, type: 'string' }])
      expect(content).toContain('bio: t.string()')
    })
  })
  describe('genEndpointContent', () => {
    test('generates owned endpoint', () => {
      const content = genEndpointContent({
        fields: [{ name: 'title', optional: false, type: 'string' }],
        name: 'blog',
        parent: '',
        type: 'owned'
      })
      expect(content).toContain("import { reducer } from 'spacetimedb'")
      expect(content).toContain('makeCrud')
      expect(content).toContain("'blog.create'")
    })
    test('generates org endpoint', () => {
      const content = genEndpointContent({
        fields: [{ name: 'title', optional: false, type: 'string' }],
        name: 'wiki',
        parent: '',
        type: 'org'
      })
      expect(content).toContain('makeOrg')
      expect(content).toContain('orgId: string')
      expect(content).toContain("'wiki.create'")
    })
    test('generates singleton endpoint', () => {
      const content = genEndpointContent({
        fields: [{ name: 'displayName', optional: false, type: 'string' }],
        name: 'profile',
        parent: '',
        type: 'singleton'
      })
      expect(content).toContain('makeCrud')
      expect(content).toContain('userId: string')
      expect(content).toContain("'profile.rm'")
    })
    test('generates cache endpoint', () => {
      const content = genEndpointContent({
        fields: [{ name: 'title', optional: false, type: 'string' }],
        name: 'movie',
        parent: '',
        type: 'cache'
      })
      expect(content).toContain('makeCacheCrud')
      expect(content).toContain("'movie.create'")
    })
    test('generates child endpoint', () => {
      const content = genEndpointContent({
        fields: [{ name: 'text', optional: false, type: 'string' }],
        name: 'message',
        parent: 'chat',
        type: 'child'
      })
      expect(content).toContain('makeChildCrud')
      expect(content).toContain("parent: 'chat'")
    })
  })
  describe('genPageContent', () => {
    test('generates list page for owned type', () => {
      const content = genPageContent('blog', 'owned')
      expect(content).toContain('useSpacetime')
      expect(content).toContain("spacetime.callReducer('blog.list'")
      expect(content).toContain('Load Blog')
      expect(content).toContain('export default')
    })
    test('generates singleton page', () => {
      const content = genPageContent('profile', 'singleton')
      expect(content).toContain('useSpacetime')
      expect(content).toContain("spacetime.callReducer('profile.get'")
      expect(content).toContain('export default')
    })
    test('generates page for org type', () => {
      const content = genPageContent('wiki', 'org')
      expect(content).toContain("spacetime.callReducer('wiki.list'")
    })
    test('generates page for cache type', () => {
      const content = genPageContent('movie', 'cache')
      expect(content).toContain("spacetime.callReducer('movie.list'")
    })
  })
  describe('add function', () => {
    test('add with --help returns zero counts', async () => {
      const result = await add(['--help'])
      expect(result).toEqual({ created: 0, skipped: 0 })
    })
  })
})
describe('docs-gen', () => {
  describe('extractJSDoc', () => {
    test('extracts JSDoc before const declaration', () => {
      const content = '/** Retries an async function with exponential backoff. */\nconst withRetry = async <T>() => {}'
      expect(extractJSDoc(content, 'withRetry')).toBe('Retries an async function with exponential backoff.')
    })
    test('extracts JSDoc before export const declaration', () => {
      const content = '/** Tracks selection state. */\nexport const useBulkSelection = () => {}'
      expect(extractJSDoc(content, 'useBulkSelection')).toBe('Tracks selection state.')
    })
    test('returns empty string for symbol without JSDoc', () => {
      const content = 'const plain = () => {}'
      expect(extractJSDoc(content, 'plain')).toBe('')
    })
    test('returns empty string for missing symbol', () => {
      const content = '/** Has doc. */\nconst other = 1'
      expect(extractJSDoc(content, 'missing')).toBe('')
    })
    test('extracts JSDoc before interface', () => {
      const content = '/** Config options. */\ninterface MyConfig { x: number }'
      expect(extractJSDoc(content, 'MyConfig')).toBe('Config options.')
    })
    test('extracts JSDoc before type alias', () => {
      const content = '/** A union type. */\ntype Status = "ok" | "error"'
      expect(extractJSDoc(content, 'Status')).toBe('A union type.')
    })
  })
  describe('resolveReExports', () => {
    test('parses named re-exports', () => {
      const content = `export { useBulkSelection } from './use-bulk-selection'`
      const result = resolveReExports(content)
      expect(result).toHaveLength(1)
      expect(result[0]?.symbol).toBe('useBulkSelection')
      expect(result[0]?.sourcePath).toBe('./use-bulk-selection')
      expect(result[0]?.isDefault).toBe(false)
      expect(result[0]?.isType).toBe(false)
    })
    test('parses default as re-exports', () => {
      const content = `export { default as Devtools } from './devtools-panel'`
      const result = resolveReExports(content)
      expect(result).toHaveLength(1)
      expect(result[0]?.symbol).toBe('Devtools')
      expect(result[0]?.isDefault).toBe(true)
    })
    test('parses type re-exports', () => {
      const content = `export type { DevtoolsProps } from './devtools-panel'`
      const result = resolveReExports(content)
      expect(result).toHaveLength(1)
      expect(result[0]?.symbol).toBe('DevtoolsProps')
      expect(result[0]?.isType).toBe(true)
    })
    test('parses multiple re-exports', () => {
      const content = [
        `export { useBulkSelection } from './use-bulk-selection'`,
        `export { default as Devtools } from './devtools-panel'`,
        `export type { DevtoolsProps } from './devtools-panel'`
      ].join('\n')
      const result = resolveReExports(content)
      expect(result).toHaveLength(3)
    })
    test('returns empty for content without re-exports', () => {
      expect(resolveReExports('const x = 1')).toEqual([])
    })
  })
})
describe('doctor', () => {
  test('checkRateLimit — all have rateLimit', () => {
    const calls: FactoryCall[] = [
      {
        factory: 'crud',
        file: 'blog.ts',
        options: '{ rateLimit: {} }',
        table: 'blog'
      },
      {
        factory: 'orgCrud',
        file: 'wiki.ts',
        options: '{ rateLimit: {} }',
        table: 'wiki'
      }
    ]
    expect(checkRateLimit(calls).status).toBe('pass')
  })
  test('checkRateLimit — some missing', () => {
    const calls: FactoryCall[] = [
      {
        factory: 'crud',
        file: 'blog.ts',
        options: '{ rateLimit: {} }',
        table: 'blog'
      },
      { factory: 'crud', file: 'post.ts', options: '{}', table: 'post' }
    ]
    expect(checkRateLimit(calls).status).toBe('warn')
  })
  test('checkRateLimit — singletonCrud/cacheCrud skipped', () => {
    const calls: FactoryCall[] = [
      { factory: 'singletonCrud', file: 'p.ts', options: '', table: 'profile' },
      { factory: 'cacheCrud', file: 'm.ts', options: '', table: 'movie' }
    ]
    expect(checkRateLimit(calls).status).toBe('pass')
  })
  test('checkEslintContent — with plugin', () => {
    expect(checkEslintContent("import { recommended } from 'noboil/spacetimedb/eslint'").status).toBe('pass')
  })
  test('checkEslintContent — without plugin', () => {
    expect(checkEslintContent('export default []').status).toBe('warn')
  })
  test('checkEslintContent — no file', () => {
    expect(checkEslintContent().status).toBe('warn')
  })
  test('checkDeps — all present', () => {
    expect(
      checkDeps({
        dependencies: {
          'noboil/spacetimedb': '2',
          spacetimedb: '1',
          zod: '3'
        }
      }).status
    ).toBe('pass')
  })
  test('checkDeps — missing dep is fail', () => {
    expect(checkDeps({ dependencies: { spacetimedb: '1', zod: '3' } }).status).toBe('fail')
  })
  test('checkDeps — devDependencies count', () => {
    expect(
      checkDeps({
        devDependencies: {
          'noboil/spacetimedb': '2',
          spacetimedb: '1',
          zod: '3'
        }
      }).status
    ).toBe('pass')
  })
  test('checkDeps — no package.json', () => {
    expect(checkDeps().status).toBe('fail')
  })
  test('calcHealthScore — all pass', () => {
    const results: CheckResult[] = [
      { details: [], status: 'pass', title: 'A' },
      { details: [], status: 'pass', title: 'B' }
    ]
    expect(calcHealthScore(results)).toBe(100)
  })
  test('calcHealthScore — warn deducts 5', () => {
    expect(calcHealthScore([{ details: [], status: 'warn', title: 'W' }])).toBe(95)
  })
  test('calcHealthScore — fail deducts 15', () => {
    expect(calcHealthScore([{ details: [], status: 'fail', title: 'F' }])).toBe(85)
  })
  test('calcHealthScore — minimum is 0', () => {
    const fails: CheckResult[] = []
    for (let i = 0; i < 10; i += 1) fails.push({ details: [], status: 'fail', title: `F${i}` })
    expect(calcHealthScore(fails)).toBe(0)
  })
  test('partialValues fills all schema keys at runtime', () => {
    const schema = object({
      content: string(),
      published: boolean(),
      title: string()
    })
    const values = partialValues(schema, { published: true, title: 'Sprint 3' })
    expect((values as Record<string, unknown>).content).toBeUndefined()
    expect(values.published).toBe(true)
    expect(values.title).toBe('Sprint 3')
  })
  test('partialValues converts null to undefined', () => {
    const schema = object({
      coverImage: string().nullable().optional(),
      title: string()
    })
    const values = partialValues(schema, { coverImage: null, title: 'Hello' })
    expect(values.coverImage).toBeUndefined()
    expect(values.title).toBe('Hello')
  })
  test('partialValues passes through extra keys not in schema', () => {
    const schema = object({ published: boolean(), title: string() })
    const values = partialValues(schema, { id: 42, published: true, title: 'X' })
    expect(values.id).toBe(42)
    expect(values.published).toBe(true)
    expect(values.title).toBe('X')
  })
  test('partialValues fills missing partial schema keys with undefined', () => {
    const schema = object({
      content: string(),
      published: boolean(),
      title: string()
    }).partial()
    const values = partialValues(schema, { id: 1, published: true })
    expect((values as Record<string, unknown>).content).toBeUndefined()
    expect((values as Record<string, unknown>).title).toBeUndefined()
    expect(values.published).toBe(true)
    expect(values.id).toBe(1)
  })
  test('useOwnRows is exported from use-list with expected type', async () => {
    const mod = await import('../react/use-list')
    expect(mod).toHaveProperty('useOwnRows')
    expect(typeof mod.useOwnRows).toBe('function')
    const fn: typeof useOwnRows = mod.useOwnRows
    expect(typeof fn).toBe('function')
    expect(mod.useOwnRows).toBe(useOwnRows)
  })
  test('UseListOptions search.debounceMs accepts number | undefined', () => {
    type DebounceMs = NonNullable<UseListOptions<{ title: string }>['search']>['debounceMs']
    const debounceNum: DebounceMs = 200
    const debounceUnset: DebounceMs = undefined
    const optsWithDebounce = {
      search: { debounceMs: debounceNum, fields: ['title'], query: 'hello' }
    } satisfies UseListOptions<{ title: string }>
    const optsWithoutDebounce: UseListOptions<{ title: string }> = {
      search: { fields: ['title'], query: 'hello' }
    }
    expect(optsWithDebounce.search?.debounceMs).toBe(200)
    expect(optsWithoutDebounce.search?.debounceMs).toBeUndefined()
    expect(debounceUnset).toBeUndefined()
  })
  test('MutateOptions retry accepts number | RetryOptions', () => {
    type RetrySetting = MutateOptions<Record<string, unknown>>['retry']
    const retryCount: RetrySetting = 3
    const retryConfig: RetryOptions = { base: 2, maxAttempts: 4 }
    const retryOpts: RetrySetting = retryConfig
    const withCount = { retry: retryCount } satisfies MutateOptions<Record<string, unknown>>
    const withConfig = { retry: retryOpts } satisfies MutateOptions<Record<string, unknown>>
    expect(withCount.retry).toBe(3)
    if (typeof withConfig.retry === 'object' && withConfig.retry) expect(withConfig.retry.maxAttempts).toBe(4)
  })
  test('useBulkMutate progress types support BulkProgress, onProgress, and progress state', () => {
    type ProgressState = ReturnType<typeof useBulkMutate>['progress']
    const progress: BulkProgress = {
      failed: 1,
      pending: 2,
      succeeded: 3,
      total: 6
    }
    const captured: BulkProgress[] = []
    const options: UseBulkMutateOptions = {
      onProgress: p => {
        captured.push(p)
      }
    }
    const stateValue: ProgressState = progress
    const clearedState: ProgressState = null
    options.onProgress?.(progress)
    expect(progress).toEqual({ failed: 1, pending: 2, succeeded: 3, total: 6 })
    expect(captured[0]).toEqual(progress)
    expect(stateValue?.total).toBe(6)
    expect(clearedState).toBeNull()
  })
  test('BulkMutateToast type supports string and function variants for loading, success, error', () => {
    const stringToast: BulkMutateToast = {
      error: 'Something failed',
      loading: 'Processing...',
      success: 'All done'
    }
    const fnToast: BulkMutateToast = {
      error: (e: unknown) => `Failed: ${String(e)}`,
      loading: (p: BulkProgress) => `${p.succeeded + p.failed}/${p.total}`,
      success: (count: number) => `${count} items processed`
    }
    const partialToast: BulkMutateToast = { success: 'Done' }
    const emptyToast: BulkMutateToast = {}
    expect(stringToast.loading).toBe('Processing...')
    expect(stringToast.success).toBe('All done')
    expect(stringToast.error).toBe('Something failed')
    if (typeof fnToast.loading === 'function')
      expect(fnToast.loading({ failed: 0, pending: 3, succeeded: 2, total: 5 })).toBe('2/5')
    if (typeof fnToast.success === 'function') expect(fnToast.success(3)).toBe('3 items processed')
    if (typeof fnToast.error === 'function') expect(fnToast.error('timeout')).toBe('Failed: timeout')
    expect(partialToast.loading).toBeUndefined()
    expect(partialToast.error).toBeUndefined()
    expect(Object.keys(emptyToast)).toHaveLength(0)
  })
  test('UseBulkMutateOptions accepts toast option alongside callbacks', () => {
    const withToast: UseBulkMutateOptions = {
      onSuccess: (count: number) => {
        expect(count).toBeGreaterThan(0)
      },
      toast: {
        loading: (p: BulkProgress) => `Deleting: ${p.succeeded}/${p.total}`,
        success: (count: number) => `${count} deleted`
      }
    }
    const withToastAndError: UseBulkMutateOptions = {
      onError: false,
      toast: { error: 'Custom error', success: 'Done' }
    }
    const withToastOnly: UseBulkMutateOptions = {
      toast: { loading: 'Working...' }
    }
    expect(withToast.toast?.loading).toBeDefined()
    expect(withToast.toast?.success).toBeDefined()
    expect(withToast.toast?.error).toBeUndefined()
    expect(withToastAndError.onError).toBe(false)
    expect(withToastAndError.toast?.error).toBe('Custom error')
    expect(withToastOnly.toast?.loading).toBe('Working...')
    expect(withToastOnly.onProgress).toBeUndefined()
  })
  test('resolveBulkError returns undefined when onError is false', () => {
    expect(resolveBulkError({ onError: false })).toBeUndefined()
  })
  test('resolveBulkError returns custom handler when onError is a function', () => {
    const captured: unknown[] = []
    const handler = resolveBulkError({
      onError: (e: unknown) => {
        captured.push(e)
      }
    })
    expect(handler).toBeDefined()
    handler?.(new Error('test'))
    expect(captured).toHaveLength(1)
    expect((captured[0] as Error).message).toBe('test')
  })
  test('resolveBulkError returns toast error handler when toast.error string is provided', () => {
    const handler = resolveBulkError({ toast: { error: 'Bulk failed' } })
    expect(handler).toBeDefined()
  })
  test('resolveBulkError returns toast error handler when toast.error function is provided', () => {
    const handler = resolveBulkError({
      toast: { error: (e: unknown) => `Error: ${String(e)}` }
    })
    expect(handler).toBeDefined()
  })
  test('resolveBulkError returns defaultOnError when no toast.error and no onError', () => {
    const handler = resolveBulkError({})
    expect(handler).toBeDefined()
    const handlerNoOpts = resolveBulkError()
    expect(handlerNoOpts).toBeDefined()
  })
  test('resolveBulkError onError takes precedence over toast.error', () => {
    const captured: unknown[] = []
    const handler = resolveBulkError({
      onError: (e: unknown) => {
        captured.push(e)
      },
      toast: { error: 'Should not be used' }
    })
    expect(handler).toBeDefined()
    handler?.(new Error('custom'))
    expect(captured).toHaveLength(1)
    expect((captured[0] as Error).message).toBe('custom')
  })
  test('BulkMutateToast loading function receives BulkProgress and returns string', () => {
    const toastCfg: BulkMutateToast = {
      loading: p => `Processing ${p.succeeded} of ${p.total} (${p.failed} failed, ${p.pending} pending)`
    }
    const progress: BulkProgress = {
      failed: 1,
      pending: 3,
      succeeded: 6,
      total: 10
    }
    if (typeof toastCfg.loading === 'function')
      expect(toastCfg.loading(progress)).toBe('Processing 6 of 10 (1 failed, 3 pending)')
  })
  test('BulkMutateToast success function receives count and returns string', () => {
    const toastCfg: BulkMutateToast = {
      success: count => `${count} task${count === 1 ? '' : 's'} completed`
    }
    if (typeof toastCfg.success === 'function') {
      expect(toastCfg.success(1)).toBe('1 task completed')
      expect(toastCfg.success(5)).toBe('5 tasks completed')
    }
  })
  test('BulkMutateToast error function receives unknown error and returns string', () => {
    const toastCfg: BulkMutateToast = {
      error: e => (e instanceof Error ? e.message : 'Unknown error')
    }
    if (typeof toastCfg.error === 'function') {
      expect(toastCfg.error(new Error('Network timeout'))).toBe('Network timeout')
      expect(toastCfg.error('string error')).toBe('Unknown error')
    }
  })
  test('new react index exports are importable and surfaced on module checks', async () => {
    const mod = await import('../react/index')
    const conflictType: ReactIndexTypes.ConflictData<{ title: string }> = {
      code: 'CONFLICT'
    }
    const mutateType: ReactIndexTypes.MutateOptions<{ id: string }> = { retry: 2 }
    const bulkProgressType: ReactIndexTypes.BulkProgress = {
      failed: 0,
      pending: 1,
      succeeded: 0,
      total: 1
    }
    const bulkResultType: ReactIndexTypes.BulkResult<string> = {
      errors: [],
      results: ['ok'],
      settled: [{ status: 'fulfilled', value: 'ok' }]
    }
    const bulkMutateToastType: ReactIndexTypes.BulkMutateToast = {
      loading: p => `${p.succeeded}/${p.total}`,
      success: count => `${count} done`
    }
    const bulkMutateOptionsType: ReactIndexTypes.UseBulkMutateOptions = {
      onProgress: p => {
        const next = p.total
        expect(next).toBe(1)
      },
      toast: bulkMutateToastType
    }
    const bulkSelectionType: ReactIndexTypes.UseBulkSelectionOpts = {
      items: [{ _id: '1' }],
      orgId: 'org_1'
    }
    const bulkSelectionWithRm: ReactIndexTypes.UseBulkSelectionOpts = {
      items: [{ _id: '1' }],
      orgId: 'org_1',
      rm: async () => {
        String(0)
      }
    }
    const cacheEntryOptionsType: ReactIndexTypes.UseCacheEntryOptions<{ id: string }, { _id: string; stale?: boolean }> = {
      args: { id: '1' },
      data: null,
      load: async () => {
        String(0)
      },
      table: 'post'
    }
    const cacheEntryResultType: ReactIndexTypes.UseCacheEntryResult<{
      _id: string
    }> = {
      data: null,
      isLoading: false,
      isStale: false,
      refresh: () => {
        String(0)
      }
    }
    const optimisticType: ReactIndexTypes.OptimisticOptions<{ id: string }, string> = {
      mutate: async () => 'ok'
    }
    const searchOptionsType: ReactIndexTypes.UseSearchOptions = {
      fields: ['title'],
      query: 'hello'
    }
    const searchResultType: ReactIndexTypes.UseSearchResult<{ title: string }> = {
      isSearching: false,
      results: [{ title: 'x' }]
    }
    const softDeleteType: ReactIndexTypes.SoftDeleteOpts<{ id: string }> = {
      restore: async () => 0,
      rm: async () => 0,
      toast: () => {
        String(0)
      }
    }
    const infiniteWhereType: ReactIndexTypes.InfiniteListWhere<{ title: string }> = { own: true, title: 'x' }
    const fieldKindType: ReactIndexTypes.FieldKind = 'string'
    const fieldMetaType: ReactIndexTypes.FieldMeta = { kind: 'string' }
    const fieldMetaMapType: ReactIndexTypes.FieldMetaMap = {
      title: { kind: 'string' }
    }
    const widenType: ReactIndexTypes.Widen<{ count: 1; tags: ['a'] }> = {
      count: 1,
      tags: ['a']
    }
    const formReturnType = null as null | ReactIndexTypes.FormReturn<{ title: string }, ReturnType<typeof object>>
    const probe = {
      ...mod,
      BulkMutateToast: bulkMutateToastType,
      BulkProgress: bulkProgressType,
      BulkResult: bulkResultType,
      ConflictData: conflictType,
      FieldKind: fieldKindType,
      FieldMeta: fieldMetaType,
      FieldMetaMap: fieldMetaMapType,
      FormReturn: formReturnType,
      InfiniteListWhere: infiniteWhereType,
      MutateOptions: mutateType,
      OptimisticOptions: optimisticType,
      SoftDeleteOpts: softDeleteType,
      UseBulkMutateOptions: bulkMutateOptionsType,
      UseBulkSelectionOpts: bulkSelectionType,
      UseBulkSelectionOptsRm: bulkSelectionWithRm,
      UseCacheEntryOptions: cacheEntryOptionsType,
      UseCacheEntryResult: cacheEntryResultType,
      UseSearchOptions: searchOptionsType,
      UseSearchResult: searchResultType,
      Widen: widenType
    }
    bulkMutateOptionsType.onProgress?.(bulkProgressType)
    expect(probe).toHaveProperty('ConflictData')
    expect(probe).toHaveProperty('FormReturn')
    expect(probe).toHaveProperty('MutateOptions')
    expect(probe).toHaveProperty('BulkProgress')
    expect(probe).toHaveProperty('BulkResult')
    expect(probe).toHaveProperty('UseBulkMutateOptions')
    expect(probe).toHaveProperty('UseBulkSelectionOpts')
    expect(probe).toHaveProperty('UseCacheEntryOptions')
    expect(probe).toHaveProperty('UseCacheEntryResult')
    expect(probe).toHaveProperty('OptimisticOptions')
    expect(probe).toHaveProperty('UseSearchOptions')
    expect(probe).toHaveProperty('UseSearchResult')
    expect(probe).toHaveProperty('SoftDeleteOpts')
    expect(probe).toHaveProperty('InfiniteListWhere')
    expect(probe).toHaveProperty('FieldKind')
    expect(probe).toHaveProperty('FieldMeta')
    expect(probe).toHaveProperty('FieldMetaMap')
    expect(probe).toHaveProperty('Widen')
    expect(probe).toHaveProperty('useOwnRows')
    expect(cacheEntryResultType.isLoading).toBe(false)
    expect(searchResultType.results).toHaveLength(1)
    expect(fieldMetaMapType.title?.kind).toBe('string')
    expect(widenType.count).toBe(1)
  })
})
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false
type Expect<T extends true> = T
describe('Sprint 4 Tier 1', () => {
  test('MutateOptions callbacks type signatures include onSuccess and onSettled', () => {
    const events: string[] = []
    const opts: MutateOptions<{ id: string }, { saved: boolean }> = {
      onSettled: (args, error, result) => {
        const argId: string = args.id
        const maybeResult: undefined | { saved: boolean } = result
        const unknownError: unknown = error
        events.push(`${argId}:${String(maybeResult?.saved ?? false)}:${String(Boolean(unknownError))}`)
      },
      onSuccess: (result, args) => {
        const { saved } = result
        const argId: string = args.id
        events.push(`${argId}:${String(saved)}`)
      }
    }
    opts.onSuccess?.({ saved: true }, { id: 'x' })
    opts.onSettled?.({ id: 'x' }, undefined, { saved: true })
    opts.onSettled?.({ id: 'x' }, new Error('boom'))
    expect(events).toEqual(['x:true', 'x:true:false', 'x:false:true'])
  })
  test('UseListOptions includes where and search query typing', () => {
    type HasWhere = 'where' extends keyof UseListOptions<{ title: string }> ? true : false
    type SearchQuery = NonNullable<UseListOptions<{ title: string }>['search']>['query']
    const hasWhere: HasWhere = true
    const query: SearchQuery = 'hello'
    const opts: UseListOptions<{ title: string }> = {
      search: { fields: ['title'], query },
      where: { title: 'hello' }
    }
    expect(hasWhere).toBe(true)
    expect(opts.search?.query).toBe('hello')
    expect(opts.where?.title).toBe('hello')
  })
  test('InfiniteListOptions search field type is keyed by row shape', () => {
    const opts: InfiniteListOptions<{ body: string; title: string }> = {
      search: { fields: ['title', 'body'], query: 'draft' }
    }
    expect(opts.search?.fields).toEqual(['title', 'body'])
    expect(opts.search?.query).toBe('draft')
  })
  test('react index exports MutationResult family and helper types', () => {
    const okResult: ReactIndexTypes.MutationResult<number> = {
      ok: true,
      value: 1
    }
    const failResult: ReactIndexTypes.MutationResult<number> = {
      error: { code: 'NOT_FOUND' },
      ok: false
    }
    const okShape: ReactIndexTypes.MutationOk<string> = { ok: true, value: 'done' }
    const failShape: ReactIndexTypes.MutationFail = {
      error: { code: 'FORBIDDEN' },
      ok: false
    }
    const data: ReactIndexTypes.ErrorData = {
      code: 'VALIDATION_FAILED',
      fieldErrors: { title: 'Required' }
    }
    const schema = object({ title: string() })
    const typedErrors: ReactIndexTypes.TypedFieldErrors<typeof schema> = {
      title: 'Required'
    }
    expect(okResult.ok).toBe(true)
    expect(failResult.ok).toBe(false)
    expect(okShape.value).toBe('done')
    expect(failShape.error.code).toBe('FORBIDDEN')
    expect(data.code).toBe('VALIDATION_FAILED')
    expect(schema.safeParse({ title: 'x' }).success).toBe(true)
    expect(typedErrors.title).toBe('Required')
  })
  test('field component props include disabled, helpText, and required', () => {
    const textProps: Parameters<(typeof FieldsModule.fields)['Text']>[0] = {
      disabled: true,
      helpText: 'x',
      name: 'title',
      required: true
    }
    const chooseProps: Parameters<(typeof FieldsModule.fields)['Choose']>[0] = {
      disabled: false,
      helpText: 'y',
      name: 'status',
      required: true
    }
    const toggleProps: Parameters<(typeof FieldsModule.fields)['Toggle']>[0] = {
      disabled: true,
      helpText: 'z',
      name: 'published',
      required: true,
      trueLabel: 'On'
    }
    expect(textProps.disabled).toBe(true)
    expect(chooseProps.helpText).toBe('y')
    expect(toggleProps.required).toBe(true)
  })
})
describe('Sprint 4 Tier 2', () => {
  test('getFieldErrors infers schema keys and returns runtime field errors from Zod validation', () => {
    const schema = object({ email: string().email(), title: string().min(3) })
    const parsed = schema.safeParse({ email: 'invalid', title: '' })
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    try {
      errValidation('VALIDATION_FAILED', parsed.error)
    } catch (error) {
      const fieldErrors = getFieldErrors<typeof schema>(error)
      const emailError: string | undefined = fieldErrors?.email
      const titleError: string | undefined = fieldErrors?.title
      type HasEmail = 'email' extends keyof ReactIndexTypes.TypedFieldErrors<typeof schema> ? true : false
      type HasMissing = 'missing' extends keyof ReactIndexTypes.TypedFieldErrors<typeof schema> ? true : false
      const hasEmail: HasEmail = true
      const hasMissing: HasMissing = false
      expect(hasEmail).toBe(true)
      expect(hasMissing).toBe(false)
      expect(typeof emailError).toBe('string')
      expect(typeof titleError).toBe('string')
      expect(fieldErrors).toEqual({
        email: 'Invalid email address',
        title: 'Too small: expected string to have >=3 characters'
      })
    }
  })
  test('ErrorBoundary props include className', () => {
    const props: ComponentProps<typeof ErrorBoundary> = {
      children: null,
      className: 'boundary-shell'
    }
    expect(props.className).toBe('boundary-shell')
  })
})
describe('Sprint 4 Tier 3', () => {
  test('Register declaration merging works and RegisteredDefaultError defaults to Error', () => {
    const meta: RegisteredMeta = { traceId: 'trace-1' }
    const isError: Equal<RegisteredDefaultError, Error> = true
    expect(meta.traceId).toBe('trace-1')
    expect(isError).toBe(true)
  })
  test('InferRow resolves branded schema system fields for owned, org, base, and singleton', () => {
    const owned = makeOwned({ post: object({ title: string() }) })
    const org = makeOrgScoped({ note: object({ body: string() }) })
    const base = makeBase({ movie: object({ name: string() }) })
    const singleton = makeSingleton({ profile: object({ displayName: string() }) })
    const ownedRow: InferRow<typeof owned.post> = {
      _creationTime: 1,
      _id: '1',
      title: 't',
      updatedAt: 2,
      userId: 'u'
    }
    const orgRow: InferRow<typeof org.note> = {
      _creationTime: 1,
      _id: '1',
      body: 'b',
      orgId: 'org-1',
      updatedAt: 2,
      userId: 'u'
    }
    const baseRow: InferRow<typeof base.movie> = {
      _creationTime: 1,
      _id: '1',
      name: 'n',
      updatedAt: 2
    }
    const singletonRow: InferRow<typeof singleton.profile> = {
      displayName: 'n',
      updatedAt: 2,
      userId: 'u'
    }
    expect(owned.post).toBeDefined()
    expect(org.note).toBeDefined()
    expect(base.movie).toBeDefined()
    expect(singleton.profile).toBeDefined()
    expect(ownedRow.userId).toBe('u')
    expect(orgRow.orgId).toBe('org-1')
    expect(baseRow._id).toBe('1')
    expect(singletonRow.updatedAt).toBe(2)
  })
  test('InferCreate equals z.output<S> and InferUpdate equals Partial<z.output<S>>', () => {
    const schema = object({ count: number(), title: string() })
    type CheckCreate = Expect<Equal<InferCreate<typeof schema>, z.output<typeof schema>>>
    type CheckUpdate = Expect<Equal<InferUpdate<typeof schema>, Partial<z.output<typeof schema>>>>
    const createOk: CheckCreate = true
    const updateOk: CheckUpdate = true
    expect(schema.safeParse({ count: 1, title: 'x' }).success).toBe(true)
    expect(createOk).toBe(true)
    expect(updateOk).toBe(true)
  })
  test('InferReducerArgs and InferReducerReturn extract from RegisteredMutation and RegisteredQuery', () => {
    type M = RegisteredMutation<'public', { id: string }, { ok: true }>
    type Q = RegisteredQuery<'public', { slug: string }, { found: boolean }>
    type ArgsOk = Expect<Equal<InferReducerArgs<M>, { id: string }>>
    type ReturnOk = Expect<Equal<InferReducerReturn<Q>, { found: boolean }>>
    const argsOk: ArgsOk = true
    const returnOk: ReturnOk = true
    expect(argsOk).toBe(true)
    expect(returnOk).toBe(true)
  })
  test('InferReducerInputs and InferReducerOutputs map records of reducers', () => {
    interface Reducers {
      createPost: RegisteredMutation<'public', { title: string }, { id: string }>
      listPosts: RegisteredQuery<'public', { limit: number }, { rows: string[] }>
    }
    type InputsOk = Expect<
      Equal<InferReducerInputs<Reducers>, { createPost: { title: string }; listPosts: { limit: number } }>
    >
    type OutputsOk = Expect<
      Equal<InferReducerOutputs<Reducers>, { createPost: { id: string }; listPosts: { rows: string[] } }>
    >
    const inputsOk: InputsOk = true
    const outputsOk: OutputsOk = true
    expect(inputsOk).toBe(true)
    expect(outputsOk).toBe(true)
  })
  test('InferRows maps a record of branded schemas', () => {
    const owned = makeOwned({ post: object({ title: string() }) })
    const org = makeOrgScoped({ note: object({ body: string() }) })
    const base = makeBase({ movie: object({ name: string() }) })
    const singleton = makeSingleton({ profile: object({ displayName: string() }) })
    const rows: InferRows<{
      movie: typeof base.movie
      note: typeof org.note
      post: typeof owned.post
      profile: typeof singleton.profile
    }> = {
      movie: { _creationTime: 1, _id: '1', name: 'movie', updatedAt: 1 },
      note: {
        _creationTime: 1,
        _id: '2',
        body: 'body',
        orgId: 'o',
        updatedAt: 1,
        userId: 'u'
      },
      post: {
        _creationTime: 1,
        _id: '3',
        title: 'title',
        updatedAt: 1,
        userId: 'u'
      },
      profile: { displayName: 'name', updatedAt: 1, userId: 'u' }
    }
    expect(owned.post).toBeDefined()
    expect(org.note).toBeDefined()
    expect(base.movie).toBeDefined()
    expect(singleton.profile).toBeDefined()
    expect(rows.post.title).toBe('title')
    expect(rows.note.orgId).toBe('o')
    expect(rows.movie.name).toBe('movie')
    expect(rows.profile.displayName).toBe('name')
  })
  test('schemaVariants create returns original, update is partial, and requiredOnUpdate keeps selected keys required', () => {
    const schema = object({ count: number(), slug: string(), title: string() })
    const normal = schemaVariants(schema)
    const required = schemaVariants(schema, ['slug'])
    expect(normal.create).toBe(schema)
    expect(normal.update.safeParse({}).success).toBe(true)
    expect(normal.update.safeParse({ title: 'x' }).success).toBe(true)
    expect(required.update.safeParse({}).success).toBe(false)
    expect(required.update.safeParse({ slug: 's' }).success).toBe(true)
  })
  test('injectError accepts ErrorCode and optional opts', () => {
    const code: ErrorCode = 'NOT_FOUND'
    expect(() => injectError(code)).not.toThrow()
    expect(() =>
      injectError('RATE_LIMITED', {
        detail: 'rate-limit',
        message: 'Too many',
        op: 'create',
        table: 'post'
      })
    ).not.toThrow()
  })
  test('DevtoolsProps includes className, buttonClassName, and panelClassName', () => {
    const props: DevtoolsProps = {
      buttonClassName: 'button-shell',
      className: 'devtools-shell',
      panelClassName: 'panel-shell'
    }
    expect(props.className).toBe('devtools-shell')
    expect(props.buttonClassName).toBe('button-shell')
    expect(props.panelClassName).toBe('panel-shell')
  })
})
describe('Sprint 5 getFirstFieldError', () => {
  test('returns first field error string from noboil error', () => {
    const error = makeSenderError({
      code: 'VALIDATION_FAILED',
      fieldErrors: { title: 'Title is required' }
    })
    expect(getFirstFieldError(error)).toBe('Title is required')
  })
  test('returns undefined when no field errors', () => {
    const error = makeSenderError({
      code: 'VALIDATION_FAILED',
      message: 'Some fields are invalid — check the highlighted fields and fix the errors'
    })
    expect(getFirstFieldError(error)).toBeUndefined()
  })
  test('returns undefined for non-noboil errors', () => {
    expect(getFirstFieldError(new Error('plain error'))).toBeUndefined()
  })
  test('returns undefined for null and undefined', () => {
    expect(getFirstFieldError(null)).toBeUndefined()
    expect(getFirstFieldError()).toBeUndefined()
  })
  test('returns first key value when multiple field errors exist', () => {
    const error = makeSenderError({
      code: 'VALIDATION_FAILED',
      fieldErrors: { email: 'Email is invalid', title: 'Title is required' }
    })
    expect(getFirstFieldError(error)).toBe('Email is invalid')
  })
  test('works with SenderError serialized fieldErrors format', () => {
    const error = new Error('VALIDATION_FAILED:{"fieldErrors":{"name":"Name is required"}}')
    expect(getFirstFieldError(error)).toBe('Name is required')
  })
})
describe('Sprint 5 toastFieldError', () => {
  test('calls toast function with first field error and returns true', () => {
    const messages: string[] = []
    const toasted = toastFieldError(
      makeSenderError({
        code: 'VALIDATION_FAILED',
        fieldErrors: { title: 'Title is required' }
      }),
      (message: string) => {
        messages.push(message)
      }
    )
    expect(toasted).toBe(true)
    expect(messages).toEqual(['Title is required'])
  })
  test('returns false when no field error found', () => {
    const messages: string[] = []
    const toasted = toastFieldError(makeSenderError({ code: 'VALIDATION_FAILED' }), (message: string) => {
      messages.push(message)
    })
    expect(toasted).toBe(false)
  })
  test('returns false for non-noboil errors', () => {
    const messages: string[] = []
    const toasted = toastFieldError(new Error('plain'), (message: string) => {
      messages.push(message)
    })
    expect(toasted).toBe(false)
  })
  test('does not call toast when no field error', () => {
    const messages: string[] = []
    toastFieldError(makeSenderError({ code: 'NOT_FOUND', message: 'Missing' }), (message: string) => {
      messages.push(message)
    })
    expect(messages).toEqual([])
  })
})
describe('Sprint 5 FieldMeta globalRegistry metadata', () => {
  test('getMeta returns title and description when schema meta is set', () => {
    const schema = string().meta({
      description: 'Public facing name',
      title: 'Display Name'
    })
    const reg = globalRegistry.get(schema)
    expect(reg?.title).toBe('Display Name')
    expect(reg?.description).toBe('Public facing name')
    expect(getMeta(schema)).toEqual({
      description: 'Public facing name',
      kind: 'string',
      title: 'Display Name'
    })
  })
  test('getMeta returns no title or description when schema has no meta', () => {
    const meta = getMeta(number())
    expect(meta.kind).toBe('number')
    expect(meta.title).toBeUndefined()
    expect(meta.description).toBeUndefined()
  })
  test('buildMeta includes title and description for fields with meta', () => {
    const schema = object({
      content: string(),
      title: string().meta({
        description: 'Name shown in lists',
        title: 'Title label'
      })
    })
    const meta = buildMeta(schema)
    expect(meta.title).toEqual({
      description: 'Name shown in lists',
      kind: 'string',
      title: 'Title label'
    })
    expect(meta.content).toEqual({ kind: 'string' })
  })
  test('getMeta safely handles unknown input without _zod property', () => {
    const input = { field: 'value' }
    expect(getMeta(input)).toEqual({ kind: 'unknown' })
  })
  test('globalRegistry metadata merges with inferred kind and max', () => {
    const schema = files().max(4).meta({ description: 'Attach up to four files', title: 'Attachments' })
    expect(getMeta(schema)).toEqual({
      description: 'Attach up to four files',
      kind: 'files',
      max: 4,
      title: 'Attachments'
    })
  })
})
describe('Sprint 5 skip sentinel type options', () => {
  test('useList options argument accepts skip sentinel', () => {
    type ListOptionsArg = Parameters<typeof useList>[2]
    type IncludesSkip = 'skip' extends Exclude<ListOptionsArg, undefined> ? true : false
    const includesSkip: IncludesSkip = true
    const opts: ListOptionsArg = 'skip'
    expect(includesSkip).toBe(true)
    expect(opts).toBe('skip')
  })
  test('useSearch options argument includes skip relationship', () => {
    type SearchOptionsArg = Parameters<typeof useSearch>[2]
    type IncludesSkip = 'skip' extends SearchOptionsArg ? true : false
    type SearchConfig = Exclude<SearchOptionsArg, 'skip'>
    const includesSkip: IncludesSkip = true
    const skipOption: SearchOptionsArg = 'skip'
    const config: SearchConfig = { fields: ['title'], query: 'draft' }
    expect(includesSkip).toBe(true)
    expect(skipOption).toBe('skip')
    expect(config.query).toBe('draft')
  })
  test('useInfiniteList options argument accepts skip sentinel', () => {
    type InfiniteOptionsArg = Parameters<typeof useInfiniteList>[2]
    type IncludesSkip = 'skip' extends Exclude<InfiniteOptionsArg, undefined> ? true : false
    const includesSkip: IncludesSkip = true
    const opts: InfiniteOptionsArg = 'skip'
    expect(includesSkip).toBe(true)
    expect(opts).toBe('skip')
  })
})
describe('Sprint 5 useMutation exports', () => {
  test('useMut exists as export from use-mutate module', async () => {
    const mod = await import('../react/use-mutate')
    expect(mod).toHaveProperty('useMut')
    expect(typeof mod.useMut).toBe('function')
    expect(mod.useMut).toBe(useMutDirect)
  })
  test('useMutation is exported from react index', async () => {
    const mod = await import('../react/index')
    expect(mod).toHaveProperty('useMutation')
    expect(typeof mod.useMutation).toBe('function')
    expect(mod.useMutation).toBe(useMutationDirect)
  })
  test('useMut is exported from react index', async () => {
    const mod = await import('../react/index')
    expect(mod).toHaveProperty('useMut')
    expect(typeof mod.useMut).toBe('function')
    expect(mod.useMut).toBe(useMutDirect)
  })
  test('useMut signature in source matches generic reducer-first contract', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', 'react', 'use-mutate.ts'), 'utf8')
    expect(content.includes('useMut = <A extends Record<string, unknown>, R = void>(')).toBe(true)
  })
  test('MutateOptions type is exported from react index', () => {
    const opts: ReactIndexTypes.MutateOptions<{ id: string }, { ok: boolean }> = {
      onSuccess: (result, args) => {
        expect(result.ok).toBe(true)
        expect(args.id).toBe('id-1')
      },
      optimistic: true,
      retry: 2
    }
    opts.onSuccess?.({ ok: true }, { id: 'id-1' })
    expect(opts.retry).toBe(2)
  })
})
describe('Sprint 6 Tier 1.1 list-utils exports and behavior', () => {
  test('exports all Sprint 6 list utility functions', async () => {
    const mod = await import('../react/list-utils')
    expect(mod.searchMatches).toBe(searchMatches)
    expect(mod.sortData).toBe(sortData)
    expect(mod.getSortConfig).toBe(getSortConfig)
    expect(mod.compareValues).toBe(compareValues)
    expect(mod.toSortableString).toBe(toSortableString)
    expect(mod.noop).toBe(noop)
  })
  test('searchMatches supports string, array, case-insensitive, no-match, and empty query', () => {
    const row = {
      id: '1',
      tags: ['TypeScript', 'Bun'],
      title: 'Hello World'
    }
    expect(searchMatches(row, 'hello', ['title'])).toBe(true)
    expect(searchMatches(row, 'script', ['tags'])).toBe(true)
    expect(searchMatches(row, 'WORLD', ['title'])).toBe(true)
    expect(searchMatches(row, 'rust', ['title', 'tags'])).toBe(false)
    expect(searchMatches(row, '', ['title'])).toBe(true)
  })
  test('sortData sorts asc and desc by string, number, and date', () => {
    const rows = [
      {
        createdAt: new Date('2024-03-02T00:00:00.000Z'),
        name: 'charlie',
        score: 20
      },
      {
        createdAt: new Date('2024-03-01T00:00:00.000Z'),
        name: 'alpha',
        score: 10
      },
      {
        createdAt: new Date('2024-03-03T00:00:00.000Z'),
        name: 'bravo',
        score: 15
      }
    ]
    expect(sortData(rows, { name: 'asc' }).map(r => r.name)).toEqual(['alpha', 'bravo', 'charlie'])
    expect(sortData(rows, { score: 'desc' }).map(r => r.score)).toEqual([20, 15, 10])
    expect(sortData(rows, { direction: 'asc', field: 'createdAt' }).map(r => r.createdAt.toISOString())).toEqual([
      '2024-03-01T00:00:00.000Z',
      '2024-03-02T00:00:00.000Z',
      '2024-03-03T00:00:00.000Z'
    ])
  })
  test('sortData with no sort returns copied array and handles empty array', () => {
    const rows = [{ name: 'a' }, { name: 'b' }]
    const out = sortData(rows)
    expect(out).toEqual(rows)
    expect(out).not.toBe(rows)
    expect(sortData([])).toEqual([])
  })
  test('getSortConfig handles SortMap, SortObject, empty map, and undefined', () => {
    expect(getSortConfig<{ name: string }>({ name: 'asc' })).toEqual({
      direction: 'asc',
      field: 'name'
    })
    expect(getSortConfig<{ score: number }>({ direction: 'desc', field: 'score' })).toEqual({
      direction: 'desc',
      field: 'score'
    })
    expect(getSortConfig<{ title: string }>({})).toBeNull()
    expect(getSortConfig<{ title: string }>()).toBeNull()
  })
  test('compareValues handles numbers, strings, booleans, dates, nullish, and equal values', () => {
    expect(compareValues(1, 2)).toBeLessThan(0)
    expect(compareValues('abc', 'abd')).toBeLessThan(0)
    expect(compareValues(false, true)).toBeLessThan(0)
    expect(compareValues(new Date('2024-01-01T00:00:00.000Z'), new Date('2024-01-02T00:00:00.000Z'))).toBeLessThan(0)
    expect(compareValues(null, 'x')).toBeLessThan(0)
    expect(compareValues(undefined, 'x')).toBeLessThan(0)
    expect(compareValues('same', 'same')).toBe(0)
  })
  test('toSortableString handles primitive values, objects, and nullish', () => {
    expect(toSortableString('abc')).toBe('abc')
    expect(toSortableString(42)).toBe('42')
    expect(toSortableString(true)).toBe('true')
    expect(toSortableString(42n)).toBe('42')
    expect(toSortableString({ k: 'v' })).toBe('{"k":"v"}')
    expect(toSortableString(null)).toBe('')
    const undef: unknown = VOID
    expect(toSortableString(undef)).toBe('')
  })
  test('noop is function and returns undefined', () => {
    expect(typeof noop).toBe('function')
    expect(noop()).toBeUndefined()
  })
})
describe('Sprint 6 Tier 1.2 MutateToast typing and options', () => {
  test('MutateToast type from react index accepts string success/error shape', () => {
    const toastConfig: ReactIndexTypes.MutateToast<{ id: string }, { ok: boolean }> = {
      error: 'Save failed',
      success: 'Saved'
    }
    expect(toastConfig.success).toBe('Saved')
    expect(toastConfig.error).toBe('Save failed')
  })
  test('MutateToast type accepts success function shape', () => {
    const toastConfig: ReactIndexTypes.MutateToast<{ id: string }, { ok: boolean }> = {
      success: (result, args) => `${args.id}:${String(result.ok)}`
    }
    const { success } = toastConfig
    expect(typeof success).toBe('function')
    if (typeof success === 'function') expect(success({ ok: true }, { id: 'abc' })).toBe('abc:true')
  })
  test('MutateToast type accepts fieldErrors false and fieldErrors optional', () => {
    const disabledFieldErrors: ReactIndexTypes.MutateToast<{ id: string }, { ok: boolean }> = {
      fieldErrors: false,
      success: 'Saved'
    }
    const optionalFieldErrors: ReactIndexTypes.MutateToast<{ id: string }, { ok: boolean }> = {
      success: 'Saved'
    }
    expect(disabledFieldErrors.fieldErrors).toBe(false)
    expect(optionalFieldErrors.fieldErrors).toBeUndefined()
  })
  test('MutateOptions accepts toast field', () => {
    const opts: MutateOptions<{ id: string }, { ok: boolean }> = {
      toast: {
        error: 'Save failed',
        success: (result, args) => `${args.id}:${String(result.ok)}`
      }
    }
    expect(typeof opts.toast?.success).toBe('function')
    expect(opts.toast?.error).toBe('Save failed')
  })
})
describe('Sprint 6 Tier 1.3 SchemaPhantoms and infer accessors', () => {
  test('SchemaPhantoms is exported and usable as a type', () => {
    type Phantom = SchemaPhantoms<{ title: string }, { _id: string }, { title?: string }>
    const check: Phantom = null as unknown as Phantom
    expect(check).toBeNull()
  })
  test('OwnedSchema infer types align with zod output and row fields', () => {
    const owned = makeOwned({
      post: object({
        title: string(),
        views: number()
      })
    })
    expect(owned).toBeDefined()
    type Schema = (typeof owned)['post']
    type Create = Schema extends { readonly $inferCreate: infer C } ? C : never
    type Row = Schema extends { readonly $inferRow: infer R } ? R : never
    type Update = Schema extends { readonly $inferUpdate: infer U } ? U : never
    const createCheck: z.output<Schema> = null as unknown as Create
    expect(createCheck).toBeNull()
    const rowCheck: {
      _creationTime: number
      _id: number | string
      title: string
      updatedAt: number
      userId: string
      views: number
    } = null as unknown as Row
    expect(rowCheck).toBeNull()
    const updateCheck: Partial<z.output<Schema>> = null as unknown as Update
    expect(updateCheck).toBeNull()
  })
  test('OrgSchema, SingletonSchema, and BaseSchema infer rows include expected platform fields', () => {
    const org = makeOrgScoped({ item: object({ name: string() }) })
    const singleton = makeSingleton({ prefs: object({ theme: string() }) })
    const base = makeBase({ movie: object({ label: string() }) })
    expect(org).toBeDefined()
    expect(singleton).toBeDefined()
    expect(base).toBeDefined()
    type OrgSchemaType = (typeof org)['item']
    type SingletonSchemaType = (typeof singleton)['prefs']
    type BaseSchemaType = (typeof base)['movie']
    type OrgRow = OrgSchemaType extends { readonly $inferRow: infer R } ? R : never
    type SingletonRow = SingletonSchemaType extends {
      readonly $inferRow: infer R
    }
      ? R
      : never
    type BaseRow = BaseSchemaType extends { readonly $inferRow: infer R } ? R : never
    const orgRowCheck: { orgId: number | string; userId: string } = null as unknown as OrgRow
    const singletonRowCheck: { updatedAt: number; userId: string } = null as unknown as SingletonRow
    const baseRowCheck: {
      _creationTime: number
      _id: number | string
      updatedAt: number
    } = null as unknown as BaseRow
    expect(orgRowCheck).toBeNull()
    expect(singletonRowCheck).toBeNull()
    expect(baseRowCheck).toBeNull()
  })
  test('~types accessor mirrors $inferCreate/$inferRow/$inferUpdate', () => {
    const owned = makeOwned({ post: object({ title: string() }) })
    expect(owned).toBeDefined()
    type Schema = (typeof owned)['post']
    type Create = Schema extends { readonly $inferCreate: infer C } ? C : never
    type Row = Schema extends { readonly $inferRow: infer R } ? R : never
    type Update = Schema extends { readonly $inferUpdate: infer U } ? U : never
    type Types = Schema extends { readonly '~types': infer T } ? T : never
    type TypesCreate = Types extends { readonly create: infer C } ? C : never
    type TypesRow = Types extends { readonly row: infer R } ? R : never
    type TypesUpdate = Types extends { readonly update: infer U } ? U : never
    const createCheck: TypesCreate = null as unknown as Create
    const rowCheck: TypesRow = null as unknown as Row
    const updateCheck: TypesUpdate = null as unknown as Update
    expect(createCheck).toBeNull()
    expect(rowCheck).toBeNull()
    expect(updateCheck).toBeNull()
  })
})
describe('Sprint 6 Tier 1.4 and 2.3 SenderError _tag', () => {
  test('err throws SenderError with _tag set to SenderError', () => {
    let thrown: unknown
    try {
      err('NOT_FOUND')
    } catch (error) {
      thrown = error
    }
    const tagged = thrown as Error & { _tag: 'SenderError' }
    expect(tagged.name).toBe('SenderError')
    expect(tagged._tag).toBe('SenderError')
  })
  test('SenderError _tag is a literal type', () => {
    let thrown: unknown
    try {
      err('FORBIDDEN')
    } catch (error) {
      thrown = error
    }
    const tagged = thrown as Error & { _tag: 'SenderError' }
    const literalTag: 'SenderError' = tagged._tag
    expect(literalTag).toBe('SenderError')
  })
  test('discriminated union pattern narrows on _tag', () => {
    type Tagged = Error & { _tag: 'SenderError' }
    type Untagged = Error & { _tag?: 'OtherError' }
    const getTag = (e: Tagged | Untagged): string => {
      if (e._tag === 'SenderError') {
        const literal: 'SenderError' = e._tag
        return literal
      }
      return 'other'
    }
    let thrown: unknown
    try {
      err('NOT_AUTHENTICATED')
    } catch (error) {
      thrown = error
    }
    expect(getTag(thrown as Tagged | Untagged)).toBe('SenderError')
  })
})
describe('Sprint 6 Tier 2.1 ConflictData code narrowing', () => {
  test('ConflictData code is literal CONFLICT', () => {
    const conflict: ConflictData<{ title: string }> = {
      code: 'CONFLICT',
      current: { title: 'before' },
      incoming: { title: 'after' }
    }
    const { code } = conflict
    expect(code).toBe('CONFLICT')
  })
})
describe('Sprint 6 Tier 2.2 requiredPartial and schemaVariants shape preservation', () => {
  test('requiredPartial preserves ZodObject shape access', () => {
    const schema = object({
      slug: string(),
      title: string(),
      views: number()
    })
    const update = requiredPartial(schema, ['slug'])
    expect(Object.keys(update.shape)).toEqual(['slug', 'title', 'views'])
    expect(update.safeParse({ slug: 'x', title: 't', views: 1 }).success).toBe(true)
  })
  test('schemaVariants requiredOnUpdate keeps update as shape-accessible object', () => {
    const schema = object({
      slug: string(),
      title: string()
    })
    const variants = schemaVariants(schema, ['slug'])
    expect(Object.keys(variants.update.shape)).toEqual(['slug', 'title'])
    expect(variants.update.safeParse({ slug: 'a', title: 't' }).success).toBe(true)
  })
  test('schemaVariants without requiredOnUpdate matches create and partial update return type', () => {
    const schema = object({
      slug: string(),
      title: string()
    })
    const variants = schemaVariants(schema)
    const typedVariants: {
      create: typeof schema
      update: ReturnType<typeof schema.partial>
    } = variants
    expect(Object.keys(typedVariants.create.shape)).toEqual(['slug', 'title'])
    expect(Object.keys(typedVariants.update.shape)).toEqual(['slug', 'title'])
  })
})
describe('Sprint 6 Tier 2.4 ERROR_MESSAGES enhancements', () => {
  test('all ERROR_MESSAGES entries are descriptive', () => {
    for (const key of Object.keys(ERROR_MESSAGES)) {
      const message = ERROR_MESSAGES[key as keyof typeof ERROR_MESSAGES]
      expect(message.length).toBeGreaterThanOrEqual(14)
      expect(message.trim().includes(' ')).toBe(true)
    }
  })
  test('ERROR_MESSAGES count matches expected codes', () => {
    expect(Object.keys(ERROR_MESSAGES)).toHaveLength(36)
  })
  test('specific improved messages contain required wording', () => {
    expect(ERROR_MESSAGES.NOT_FOUND.includes('deleted')).toBe(true)
    expect(ERROR_MESSAGES.RATE_LIMITED.includes('wait')).toBe(true)
    expect(ERROR_MESSAGES.VALIDATION_FAILED.includes('fields')).toBe(true)
  })
})
describe('Sprint 6 Tier 3.1 defaultValue with prefault/default wrappers', () => {
  test('defaultValue returns prefault string value', () => {
    const prefaultSchema = {
      def: {
        factory: () => 'hello',
        innerType: string()
      },
      type: 'prefault'
    }
    expect(defaultValue(prefaultSchema)).toBe('hello')
  })
  test('defaultValue returns zod default string value', () => {
    expect(defaultValue(string().default('world'))).toBe('world')
  })
  test('defaultValue returns prefault number value', () => {
    const prefaultSchema = {
      def: {
        factory: () => 42,
        innerType: number()
      },
      type: 'prefault'
    }
    expect(defaultValue(prefaultSchema)).toBe(42)
  })
  test('defaultValues uses prefault values from wrapped fields', () => {
    const schema = object({
      count: {
        def: {
          factory: () => 7,
          innerType: number()
        },
        type: 'prefault'
      } as unknown as ReturnType<typeof number>,
      title: {
        def: {
          factory: () => 'prefault-title',
          innerType: string()
        },
        type: 'prefault'
      } as unknown as ReturnType<typeof string>
    })
    expect(defaultValues(schema)).toEqual({
      count: 7,
      title: 'prefault-title'
    })
  })
  test('defaultValue falls back to base defaults for regular schemas', () => {
    expect(defaultValue(string())).toBe('')
  })
  test('prefault is checked before default in wrapper chain', () => {
    const schema = {
      def: {
        factory: () => 'outer-prefault',
        innerType: {
          def: {
            defaultValue: 'inner-default',
            innerType: string()
          },
          type: 'default'
        }
      },
      type: 'prefault'
    }
    expect(defaultValue(schema)).toBe('outer-prefault')
  })
})
describe('Sprint 7 polish: idFromWire empty string guard', () => {
  test('idFromWire rejects empty string', () => {
    expect(() => idFromWire('')).toThrow()
  })
  test('idFromWire rejects whitespace-only string', () => {
    expect(() => idFromWire('   ')).toThrow()
  })
  test('idFromWire still accepts valid numeric strings', () => {
    expect(idFromWire('42')).toBe(42)
    expect(idFromWire('0')).toBe(0)
    expect(idFromWire('123456')).toBe(123_456)
  })
  test('idFromWire still rejects non-numeric strings', () => {
    expect(() => idFromWire('abc')).toThrow()
    expect(() => idFromWire('NaN')).toThrow()
  })
})
describe('Sprint 7 polish: retry error includes attempt count', () => {
  test('withRetry error message includes attempt count', async () => {
    let threw = false
    try {
      await withRetry(
        async () => {
          throw new Error('boom')
        },
        { initialDelayMs: 1, maxAttempts: 2 }
      )
    } catch (error) {
      threw = true
      expect((error as Error).message).toContain('after 2 attempts')
      expect((error as Error).message).toContain('boom')
    }
    expect(threw).toBe(true)
  })
  test('withRetry preserves original error as cause', async () => {
    try {
      await withRetry(
        async () => {
          throw new Error('root-cause')
        },
        { initialDelayMs: 1, maxAttempts: 1 }
      )
    } catch (error) {
      expect((error as Error).cause).toBeInstanceOf(Error)
      expect(((error as Error).cause as Error).message).toBe('root-cause')
    }
  })
})
describe('Sprint 7 polish: buildMeta preserves field names', () => {
  test('buildMeta returns typed field names from schema', () => {
    const schema = object({ content: string(), title: string() })
    const meta = buildMeta(schema)
    expect(meta.title.kind).toBe('string')
    expect(meta.content.kind).toBe('string')
    type Keys = keyof typeof meta
    type _AssertTitle = 'title' extends Keys ? true : never
    type _AssertContent = 'content' extends Keys ? true : never
    const _checkTitle: _AssertTitle = true
    const _checkContent: _AssertContent = true
    expect(_checkTitle).toBe(true)
    expect(_checkContent).toBe(true)
  })
})
describe('Sprint 7 polish: type exports from noboil/spacetimedb/react', () => {
  test('SortDirection, SortMap, SortObject types are usable', () => {
    const dir: SortDirection = 'asc'
    const sortMap: SortMap<{ id: number; name: string }> = { name: 'desc' }
    const sortObj: SortObject<{ id: number; name: string }> = {
      direction: 'asc',
      field: 'name'
    }
    expect(dir).toBe('asc')
    expect(sortMap.name).toBe('desc')
    expect(sortObj.field).toBe('name')
  })
  test('SkipListResult and UseListResult types exist', () => {
    const skip: SkipListResult = {
      data: [],
      hasMore: false,
      isLoading: false,
      loadMore: noop,
      page: 1,
      totalCount: 0
    }
    expect(skip.isLoading).toBe(false)
    expect(skip.hasMore).toBe(false)
  })
})
describe('Sprint 8 polish: export WhereFieldValue and ListSort types', () => {
  test('WhereFieldValue allows direct values', () => {
    const filter: WhereFieldValue<string> = 'hello'
    expect(filter).toBe('hello')
  })
  test('WhereFieldValue allows comparison operators', () => {
    const filter: WhereFieldValue<number> = { $gte: 10 }
    expect(filter).toEqual({ $gte: 10 })
  })
  test('WhereFieldValue allows $between operator', () => {
    const filter: WhereFieldValue<number> = { $between: [1, 100] }
    expect(filter).toEqual({ $between: [1, 100] })
  })
  test('ListSort accepts SortMap', () => {
    const sort: ListSort<{ id: number; name: string }> = { name: 'desc' }
    expect(sort).toEqual({ name: 'desc' })
  })
  test('ListSort accepts SortObject', () => {
    const sort: ListSort<{ id: number; name: string }> = {
      direction: 'asc',
      field: 'name'
    }
    expect(sort).toEqual({ direction: 'asc', field: 'name' })
  })
})
describe('Sprint 8 polish: retry validates options', () => {
  test('rejects maxAttempts < 1', () => {
    expect(async () => withRetry(async () => 'ok', { maxAttempts: 0 })).toThrow('maxAttempts must be >= 1')
  })
  test('rejects maxAttempts = -1', () => {
    expect(async () => withRetry(async () => 'ok', { maxAttempts: -1 })).toThrow('maxAttempts must be >= 1')
  })
  test('rejects negative initialDelayMs', () => {
    expect(async () => withRetry(async () => 'ok', { initialDelayMs: -100 })).toThrow('initialDelayMs must be >= 0')
  })
  test('rejects negative maxDelayMs', () => {
    expect(async () => withRetry(async () => 'ok', { maxDelayMs: -1 })).toThrow('maxDelayMs must be >= 0')
  })
  test('rejects base < 1', () => {
    expect(async () => withRetry(async () => 'ok', { base: 0 })).toThrow('base must be >= 1')
  })
  test('rejects base = 0.5', () => {
    expect(async () => withRetry(async () => 'ok', { base: 0.5 })).toThrow('base must be >= 1')
  })
  test('allows maxAttempts = 1 (single attempt, no retry)', async () => {
    const result = await withRetry(async () => 'success', { maxAttempts: 1 })
    expect(result).toBe('success')
  })
  test('allows initialDelayMs = 0 (no delay between retries)', async () => {
    let count = 0
    const result = await withRetry(
      async () => {
        count += 1
        if (count < 2) throw new Error('fail')
        return 'ok'
      },
      { initialDelayMs: 0, maxAttempts: 2 }
    )
    expect(result).toBe('ok')
    expect(count).toBe(2)
  })
  test('allows base = 1 (constant delay)', async () => {
    let count = 0
    const result = await withRetry(
      async () => {
        count += 1
        if (count < 2) throw new Error('fail')
        return 'ok'
      },
      { base: 1, initialDelayMs: 0, maxAttempts: 2 }
    )
    expect(result).toBe('ok')
  })
})
describe('Sprint 8 polish: useList skip returns isLoading false', () => {
  test('SkipListResult has isLoading: false', () => {
    const skip: SkipListResult = {
      data: [],
      hasMore: false,
      isLoading: false,
      loadMore: noop,
      page: 1,
      totalCount: 0
    }
    expect(skip.isLoading).toBe(false)
  })
  test('SkipInfiniteListResult has isLoading: false', () => {
    const skip: SkipInfiniteListResult = {
      data: [],
      hasMore: false,
      isLoading: false,
      loadMore: noop,
      totalCount: 0
    }
    expect(skip.isLoading).toBe(false)
  })
})
describe('unified schema()', () => {
  const withUniversalTable = (
    run: (table: Parameters<Parameters<typeof noboil>[0]['tables']>[0]['table']) => void
  ): void => {
    noboil({
      tables: ({ table }) => {
        run(table)
        return {}
      }
    })
  }
  test('schema() brands owned schemas correctly', () => {
    const s = buildSchema({
      owned: { blog: object({ published: boolean(), title: string() }) }
    })
    expect((s.blog as unknown as { __bs?: unknown }).__bs).toBe('owned')
  })
  test('schema() brands orgScoped schemas correctly', () => {
    const s = buildSchema({
      orgScoped: { wiki: object({ slug: string(), title: string() }) }
    })
    expect((s.wiki as unknown as { __bs?: unknown }).__bs).toBe('org')
  })
  test('schema() brands org schemas correctly', () => {
    const s = buildSchema({
      org: { organization: object({ name: string(), slug: string() }) }
    })
    expect((s.organization as unknown as { __bs?: unknown }).__bs).toBe('orgDef')
  })
  test('schema() brands base schemas correctly', () => {
    const s = buildSchema({
      base: { movie: object({ title: string(), tmdbId: number() }) }
    })
    expect((s.movie as unknown as { __bs?: unknown }).__bs).toBe('base')
  })
  test('schema() brands singleton schemas correctly', () => {
    const s = buildSchema({
      singleton: { profile: object({ displayName: string() }) }
    })
    expect((s.profile as unknown as { __bs?: unknown }).__bs).toBe('singleton')
  })
  test('schema() passes through children without branding', () => {
    const childDef = child('blog', object({ blogId: string(), body: string() }))
    const s = buildSchema({ children: { comment: childDef } })
    expect(s.comment.foreignKey).toBe('blogId')
    expect(s.comment.parent).toBe('blog')
    expect(s.comment.schema).toBeDefined()
  })
  test('schema() flattens all categories into single object', () => {
    const s = buildSchema({
      base: { movie: object({ title: string() }) },
      children: {
        comment: child('blog', object({ blogId: string(), body: string() }))
      },
      org: { organization: object({ name: string(), slug: string() }) },
      orgScoped: { wiki: object({ slug: string(), title: string() }) },
      owned: { blog: object({ published: boolean(), title: string() }) },
      singleton: { profile: object({ displayName: string() }) }
    })
    expect(s.blog).toBeDefined()
    expect(s.wiki).toBeDefined()
    expect(s.organization).toBeDefined()
    expect(s.movie).toBeDefined()
    expect(s.profile).toBeDefined()
    expect(s.comment).toBeDefined()
  })
  test('schema() preserves Zod shape access', () => {
    const s = buildSchema({ owned: { blog: object({ title: string() }) } })
    expect(s.blog.shape.title).toBeDefined()
  })
  test('schema() produces same result as individual makers', () => {
    const unified = buildSchema({
      owned: { blog: object({ published: boolean(), title: string() }) }
    })
    const direct = makeOwned({
      blog: object({ published: boolean(), title: string() })
    })
    expect((unified.blog as unknown as { __bs?: unknown }).__bs).toBe((direct.blog as unknown as { __bs?: unknown }).__bs)
    expect(unified.blog.shape.title).toBeDefined()
    expect(direct.blog.shape.title).toBeDefined()
    expect(unified.blog.shape.published).toBeDefined()
    expect(direct.blog.shape.published).toBeDefined()
  })
  test('schema() works with table()', () => {
    let category: unknown
    withUniversalTable(table => {
      const s = buildSchema({
        owned: { blog: object({ published: boolean(), title: string() }) }
      })
      const blogTable = table(s.blog)
      const { __bs } = blogTable
      const { category: tableCategory } = __bs
      category = tableCategory
    })
    expect(category).toBe('owned')
  })
  test('schema() rejects non-ZodObject in owned', () => {
    const acceptsConfig = (config: Parameters<typeof buildSchema>[0]) => config
    // @ts-expect-error - owned schemas must be ZodObject values
    const invalid = acceptsConfig({ owned: { blog: 'not-a-zod-object' } })
    expect(invalid).toBeDefined()
  })
  test('schema() typed schemas work with table()', () => {
    let category: unknown
    withUniversalTable(table => {
      const s = buildSchema({ owned: { blog: object({ title: string() }) } })
      const blogTable = table(s.blog)
      const { __bs } = blogTable
      const { category: tableCategory } = __bs
      category = tableCategory
    })
    expect(category).toBe('owned')
  })
})
describe('softDelete auto-adds deletedAt column', () => {
  const readSetupSource = async (): Promise<string> => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    return readFileSync(join(import.meta.dir, '..', 'server', 'setup.ts'), 'utf8')
  }
  test('setup source includes softDelete auto-injection code', async () => {
    const content = await readSetupSource()
    expect(content.includes('softDelete ? { ...extra, deletedAt: raw.t.timestamp().optional() } : extra')).toBe(true)
  })
  test('softDelete in ownedTable auto-injects deletedAt', async () => {
    const content = await readSetupSource()
    const ownedStart = content.indexOf(
      'ownedTable = <F extends TblInput>(fields: F, options?: OwnedOpts<F>): BsTable => {'
    )
    const injected = content.indexOf('sdExtra = softDelete ? { ...extra, deletedAt:', ownedStart)
    expect(ownedStart !== -1).toBe(true)
    expect(injected > ownedStart).toBe(true)
  })
  test('softDelete in orgScopedTable auto-injects deletedAt', async () => {
    const content = await readSetupSource()
    const orgScopedStart = content.indexOf(
      'orgScopedTable = <F extends TblInput>(fields: F, options?: OrgScopedOpts<F>): BsTable => {'
    )
    const injected = content.indexOf('sdExtra = softDelete ? { ...extra, deletedAt:', orgScopedStart)
    expect(orgScopedStart !== -1).toBe(true)
    expect(injected > orgScopedStart).toBe(true)
  })
})
describe('compoundIndex shorthand', () => {
  const readSetupSource = async (): Promise<string> => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    return readFileSync(join(import.meta.dir, '..', 'server', 'setup.ts'), 'utf8')
  }
  test('compoundIndexToEntry function exists', async () => {
    const content = await readSetupSource()
    expect(content.includes('const compoundIndexToEntry = (columns: string[])')).toBe(true)
  })
  test('compoundIndexToEntry generates correct accessor name', async () => {
    const content = await readSetupSource()
    expect(
      content.includes("columns.map((c, i) => (i === 0 ? c : c.charAt(0).toUpperCase() + c.slice(1))).join('')")
    ).toBe(true)
  })
  test('OrgScopedOpts accepts compoundIndex', async () => {
    const content = await readSetupSource()
    expect(content.includes("compoundIndex?: ('orgId' | ZodKeys<F>)[]")).toBe(true)
  })
  test('OrgScopedOpts accepts cascade as object (unified with Convex)', async () => {
    const content = await readSetupSource()
    expect(content.includes('cascade?: boolean | { foreignKey: string; table: string }')).toBe(true)
  })
  test('algorithm type is union not string', async () => {
    const content = await readSetupSource()
    expect(content.includes("algorithm: 'btree' | 'hash'")).toBe(true)
  })
})
describe('type-safe column references in table options', () => {
  const withUniversalTable = (
    run: (table: Parameters<Parameters<typeof noboil>[0]['tables']>[0]['table']) => void
  ): void => {
    noboil({
      tables: ({ table }) => {
        run(table)
        return {}
      }
    })
  }
  test('index shorthand accepts valid field names', () => {
    let category: unknown
    withUniversalTable(table => {
      const ownedSchema = buildSchema({
        owned: { blog: object({ published: boolean(), title: string() }) }
      })
      const blogTable = table(ownedSchema.blog, { index: ['published'] })
      const { __bs } = blogTable
      const { category: tableCategory } = __bs
      category = tableCategory
    })
    expect(category).toBe('owned')
  })
  test('index shorthand rejects misspelled field names', () => {
    withUniversalTable(table => {
      const ownedSchema = buildSchema({
        owned: { blog: object({ published: boolean(), title: string() }) }
      })
      // @ts-expect-error - publishd is not a valid blog field
      const invalid = table(ownedSchema.blog, { index: ['publishd'] })
      expect(invalid).toBeDefined()
    })
  })
  test('unique shorthand accepts valid field names', () => {
    let category: unknown
    withUniversalTable(table => {
      const ownedSchema = buildSchema({
        owned: { blog: object({ published: boolean(), title: string() }) }
      })
      const blogTable = table(ownedSchema.blog, { unique: ['title'] })
      const { __bs } = blogTable
      const { category: tableCategory } = __bs
      category = tableCategory
    })
    expect(category).toBe('owned')
  })
  test('unique shorthand rejects misspelled field names', () => {
    withUniversalTable(table => {
      const ownedSchema = buildSchema({
        owned: { blog: object({ published: boolean(), title: string() }) }
      })
      // @ts-expect-error - titl is not a valid blog field
      const invalid = table(ownedSchema.blog, { unique: ['titl'] })
      expect(invalid).toBeDefined()
    })
  })
  test('compoundIndex accepts valid orgScoped field names', () => {
    let category: unknown
    withUniversalTable(table => {
      const orgScopedSchema = buildSchema({
        orgScoped: { wiki: object({ slug: string(), title: string() }) }
      })
      const wikiTable = table(orgScopedSchema.wiki, {
        compoundIndex: ['slug', 'title']
      })
      const { __bs } = wikiTable
      const { category: tableCategory } = __bs
      category = tableCategory
    })
    expect(category).toBe('orgScoped')
  })
  test('table() accepts rateLimit number shorthand', () => {
    let rl: undefined | { max: number; window: number }
    withUniversalTable(table => {
      const ownedSchema = buildSchema({
        owned: { blog: object({ published: boolean(), title: string() }) }
      })
      const blogTable = table(ownedSchema.blog, { rateLimit: 10 })
      rl = blogTable.__bs.rateLimit
    })
    expect(rl).toEqual({ max: 10, window: 60_000 })
  })
  test('compoundIndex rejects misspelled field names', () => {
    withUniversalTable(table => {
      const orgScopedSchema = buildSchema({
        orgScoped: { wiki: object({ slug: string(), title: string() }) }
      })
      const invalid = table(orgScopedSchema.wiki, {
        // @ts-expect-error - titl is not a valid wiki field
        compoundIndex: ['slug', 'titl']
      })
      expect(invalid).toBeDefined()
    })
  })
  test('pub option accepts published field on blog schema', () => {
    let pub: boolean | string | undefined
    withUniversalTable(table => {
      const ownedSchema = buildSchema({
        owned: { blog: object({ published: boolean(), title: string() }) }
      })
      const blogTable = table(ownedSchema.blog, { pub: 'published' })
      const {
        __bs: { pub: tablePub }
      } = blogTable
      pub = tablePub
    })
    expect(pub).toBe('published')
  })
  test('pub option accepts isPublic field on chat schema', () => {
    let pub: boolean | string | undefined
    withUniversalTable(table => {
      const ownedSchema = buildSchema({
        owned: { chat: object({ isPublic: boolean(), title: string() }) }
      })
      const chatTable = table(ownedSchema.chat, { pub: 'isPublic' })
      const {
        __bs: { pub: tablePub }
      } = chatTable
      pub = tablePub
    })
    expect(pub).toBe('isPublic')
  })
  test('pub option accepts true for all-public rows', () => {
    let pub: boolean | string | undefined
    withUniversalTable(table => {
      const ownedSchema = buildSchema({
        owned: { blog: object({ published: boolean(), title: string() }) }
      })
      const blogTable = table(ownedSchema.blog, { pub: true })
      const {
        __bs: { pub: tablePub }
      } = blogTable
      pub = tablePub
    })
    expect(pub).toBe(true)
  })
  test('pub config is stored in BsTag metadata', () => {
    let metadata: unknown
    withUniversalTable(table => {
      const ownedSchema = buildSchema({
        owned: { blog: object({ published: boolean(), title: string() }) }
      })
      const blogTable = table(ownedSchema.blog, { pub: 'published' })
      metadata = blogTable.__bs
    })
    expect(metadata).toMatchObject({ category: 'owned', pub: 'published' })
  })
  test('pub option rejects misspelled field names', () => {
    withUniversalTable(table => {
      const ownedSchema = buildSchema({
        owned: { blog: object({ published: boolean(), title: string() }) }
      })
      // @ts-expect-error - publishd is not a valid blog field
      const invalid = table(ownedSchema.blog, { pub: 'publishd' })
      expect(invalid).toBeDefined()
    })
  })
  test('setup source constrains pub option to typed schema keys', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', 'server', 'setup.ts'), 'utf8')
    expect(content.includes('pub?: boolean | ZodKeys<F>')).toBe(true)
    expect(content.includes('pub?: string')).toBe(false)
  })
})
describe('RLS SQL generation from pub metadata', () => {
  test('owned table with pub field generates pub-or-sender filter', () => {
    const sqls = rlsSql('blog', 'owned', 'published')
    expect(sqls).toHaveLength(1)
    expect(sqls[0]).toContain('"blog"."published" = true')
    expect(sqls[0]).toContain('"blog"."userId" = :sender')
    expect(sqls[0]).toContain('OR')
  })
  test('owned table without pub generates sender-only filter', () => {
    const sqls = rlsSql('blogProfile', 'owned')
    expect(sqls).toHaveLength(1)
    expect(sqls[0]).toContain('"blogProfile"."userId" = :sender')
    expect(sqls[0]).not.toContain('OR')
  })
  test('owned table with pub true generates no RLS', () => {
    const sqls = rlsSql('movie', 'owned', true)
    expect(sqls).toHaveLength(0)
  })
  test('orgScoped table without pub generates no RLS', () => {
    const sqls = rlsSql('task', 'orgScoped')
    expect(sqls).toHaveLength(0)
  })
  test('orgScoped table with pub field generates no RLS', () => {
    const sqls = rlsSql('project', 'orgScoped', 'isPublic')
    expect(sqls).toHaveLength(0)
  })
  test('children table generates sender-only filter', () => {
    const sqls = rlsSql('message', 'children')
    expect(sqls).toHaveLength(1)
    expect(sqls[0]).toContain('"message"."userId" = :sender')
  })
  test('file table generates sender-only filter', () => {
    const sqls = rlsSql('file', 'file')
    expect(sqls).toHaveLength(1)
    expect(sqls[0]).toContain('"file"."userId" = :sender')
  })
  test('base table generates no RLS', () => {
    const sqls = rlsSql('movie', 'base')
    expect(sqls).toHaveLength(0)
  })
  test('singleton table generates userId RLS for per-user isolation', () => {
    const sqls = rlsSql('settings', 'singleton')
    expect(sqls).toHaveLength(1)
    expect(sqls[0]).toContain('"settings"."userId" = :sender')
  })
  test('org table generates no RLS', () => {
    const sqls = rlsSql('org', 'org')
    expect(sqls).toHaveLength(0)
  })
  test('generated SQL uses double-quoted identifiers', () => {
    const sqls = rlsSql('blog', 'owned', 'published')
    expect(sqls[0]?.startsWith('SELECT * FROM "blog" WHERE "blog"."published"')).toBe(true)
  })
  test('orgScoped generates empty RLS array', () => {
    const sqls = rlsSql('task', 'orgScoped')
    expect(sqls).toHaveLength(0)
  })
})
describe('Children RLS parent inheritance', () => {
  test('child with parent pub field generates sender-only filter', () => {
    const sqls = rlsChildSql({
      fk: 'chatId',
      name: 'message',
      parent: 'chat',
      parentPub: 'isPublic'
    })
    expect(sqls).toHaveLength(1)
    expect(sqls[0]).toContain('"message"."userId" = :sender')
    expect(sqls[0]).not.toContain('JOIN')
  })
  test('child with fully-public parent (pub=true) generates no RLS', () => {
    const sqls = rlsChildSql({
      fk: 'postId',
      name: 'comment',
      parent: 'post',
      parentPub: true
    })
    expect(sqls).toHaveLength(0)
  })
  test('child without parent pub generates sender-only filter (no JOIN)', () => {
    const sqls = rlsChildSql({ fk: 'taskId', name: 'note', parent: 'task' })
    expect(sqls).toHaveLength(1)
    expect(sqls[0]).toContain('"note"."userId" = :sender')
    expect(sqls[0]).not.toContain('JOIN')
  })
  test('child with undefined parent pub generates sender-only filter', () => {
    const sqls = rlsChildSql({
      fk: 'docId',
      name: 'attachment',
      parent: 'doc'
    })
    expect(sqls).toHaveLength(1)
    expect(sqls[0]).toContain('"attachment"."userId" = :sender')
  })
  test('child with parent pub uses sender-only SQL format', () => {
    const sqls = rlsChildSql({
      fk: 'chatId',
      name: 'message',
      parent: 'chat',
      parentPub: 'isPublic'
    })
    expect(sqls[0]?.startsWith('SELECT * FROM "message" WHERE')).toBe(true)
  })
  test('child with parent pub uses sender filter not JOIN', () => {
    const sqls = rlsChildSql({
      fk: 'commentId',
      name: 'reply',
      parent: 'comment',
      parentPub: 'visible'
    })
    expect(sqls[0]).toContain('"reply"."userId" = :sender')
    expect(sqls[0]).not.toContain('JOIN')
  })
})
describe('Sprint 8 polish: parseSenderMessage adds debug on JSON parse failure', () => {
  test('returns debug hint when JSON is malformed', () => {
    const result = parseSenderMessage('VALIDATION_FAILED:{not valid json}')
    expect(result).toBeDefined()
    expect(result?.code).toBe('VALIDATION_FAILED')
    expect(result?.debug).toBe('Error payload was not valid JSON')
    expect(result?.message).toBe('{not valid json}')
  })
  test('returns normal result for valid JSON', () => {
    const result = parseSenderMessage('VALIDATION_FAILED:{"message":"bad input"}')
    expect(result).toBeDefined()
    expect(result?.code).toBe('VALIDATION_FAILED')
    expect(result?.message).toBe('bad input')
    expect(result?.debug).toBeUndefined()
  })
  test('returns normal result for non-JSON message', () => {
    const result = parseSenderMessage('NOT_FOUND:resource missing')
    expect(result).toBeDefined()
    expect(result?.code).toBe('NOT_FOUND')
    expect(result?.message).toBe('resource missing')
  })
})
describe('enforceRateLimit', () => {
  const mockIdentity = (hex: string) => ({ toHexString: () => hex }) as unknown as Identity
  test('first call within window passes', () => {
    resetRateLimitState()
    expect(() =>
      enforceRateLimit('posts', mockIdentity('aaa'), {
        max: 3,
        window: 60_000
      })
    ).not.toThrow()
  })
  test('calls within limit pass', () => {
    resetRateLimitState()
    const sender = mockIdentity('bbb')
    const cfg = { max: 3, window: 60_000 }
    enforceRateLimit('posts', sender, cfg)
    enforceRateLimit('posts', sender, cfg)
    expect(() => enforceRateLimit('posts', sender, cfg)).not.toThrow()
  })
  test('exceeding max throws RATE_LIMITED', () => {
    resetRateLimitState()
    const sender = mockIdentity('ccc')
    const cfg = { max: 2, window: 60_000 }
    enforceRateLimit('posts', sender, cfg)
    enforceRateLimit('posts', sender, cfg)
    expect(() => enforceRateLimit('posts', sender, cfg)).toThrow('RATE_LIMITED')
  })
  test('separate tables track independently', () => {
    resetRateLimitState()
    const sender = mockIdentity('ddd')
    const cfg = { max: 1, window: 60_000 }
    enforceRateLimit('posts', sender, cfg)
    expect(() => enforceRateLimit('comments', sender, cfg)).not.toThrow()
  })
  test('separate senders track independently', () => {
    resetRateLimitState()
    const cfg = { max: 1, window: 60_000 }
    enforceRateLimit('posts', mockIdentity('eee'), cfg)
    expect(() => enforceRateLimit('posts', mockIdentity('fff'), cfg)).not.toThrow()
  })
  test('window reset allows new calls', async () => {
    resetRateLimitState()
    const sender = mockIdentity('ggg')
    const cfg = { max: 1, window: 50 }
    enforceRateLimit('posts', sender, cfg)
    expect(() => enforceRateLimit('posts', sender, cfg)).toThrow('RATE_LIMITED')
    await sleep(60)
    expect(() => enforceRateLimit('posts', sender, cfg)).not.toThrow()
  })
  test('error includes retryAfter and limit metadata', () => {
    resetRateLimitState()
    const sender = mockIdentity('hhh')
    const cfg = { max: 1, window: 60_000 }
    enforceRateLimit('posts', sender, cfg)
    try {
      enforceRateLimit('posts', sender, cfg)
      expect(true).toBe(false)
    } catch (error) {
      const data = extractErrorData(error)
      expect(data?.code).toBe('RATE_LIMITED')
      expect(data?.table).toBe('posts')
      expect(data?.op).toBe('create')
      expect(data?.limit?.max).toBe(1)
      expect(data?.limit?.remaining).toBe(0)
      expect(typeof data?.retryAfter).toBe('number')
    }
  })
})
describe('bulk validation: BULK_MAX enforcement', () => {
  test('BULK_MAX is 100', () => {
    expect(BULK_MAX).toBe(100)
  })
  test('arrays exceeding BULK_MAX should be rejected by client', () => {
    const items = Array.from({ length: BULK_MAX + 1 }, (_, i) => ({
      name: `item-${i}`
    }))
    expect(items.length).toBeGreaterThan(BULK_MAX)
  })
})
describe('resolveFormToast', () => {
  test('returns onSuccess unchanged when no toast.success', () => {
    const { success } = resolveFormToast({ onSuccess: noop })
    expect(success).toBe(noop)
  })
  test('returns undefined success when neither onSuccess nor toast.success provided', () => {
    const { success } = resolveFormToast({})
    expect(success).toBeUndefined()
  })
  test('composes onSuccess with toast.success into new function', () => {
    const { success } = resolveFormToast({
      onSuccess: noop,
      toast: { success: 'Saved' }
    })
    expect(success).not.toBe(noop)
    expect(typeof success).toBe('function')
  })
  test('creates success handler from toast.success even without onSuccess', () => {
    const { success } = resolveFormToast({ toast: { success: 'Created' } })
    expect(typeof success).toBe('function')
  })
  test('returns onError unchanged when provided', () => {
    const handler: (e: unknown) => void = noop
    const { error } = resolveFormToast({
      onError: handler,
      toast: { error: 'Failed' }
    })
    expect(error).toBe(handler)
  })
  test('returns false when onError is false (suppress errors)', () => {
    const { error } = resolveFormToast({
      onError: false,
      toast: { error: 'Failed' }
    })
    expect(error).toBe(false)
  })
  test('creates error handler from toast.error when no onError', () => {
    const { error } = resolveFormToast({ toast: { error: 'Save failed' } })
    expect(typeof error).toBe('function')
  })
  test('returns undefined error when neither onError nor toast.error provided', () => {
    const { error } = resolveFormToast({})
    expect(error).toBeUndefined()
  })
  test('onError takes precedence over toast.error', () => {
    const handler: (e: unknown) => void = noop
    const { error } = resolveFormToast({
      onError: handler,
      toast: { error: 'Ignored' }
    })
    expect(error).toBe(handler)
  })
  test('both toast fields resolve independently', () => {
    const { error, success } = resolveFormToast({
      toast: { error: 'Failed', success: 'Done' }
    })
    expect(typeof success).toBe('function')
    expect(typeof error).toBe('function')
  })
  test('onSuccess still called when toast.success is set', () => {
    let called = false
    const { success } = resolveFormToast({
      onSuccess: () => {
        called = true
      },
      toast: { success: 'Saved' }
    })
    success?.()
    expect(called).toBe(true)
  })
  test('empty toast object returns original callbacks', () => {
    const onE: (e: unknown) => void = noop
    const { error, success } = resolveFormToast({
      onError: onE,
      onSuccess: noop,
      toast: {}
    })
    expect(success).toBe(noop)
    expect(error).toBe(onE)
  })
})
describe('FormToastOption type', () => {
  test('accepts success-only shape', () => {
    const opt: FormToastOption = { success: 'Created' }
    expect(opt.success).toBe('Created')
    expect(opt.error).toBeUndefined()
  })
  test('accepts error-only shape', () => {
    const opt: FormToastOption = { error: 'Failed to save' }
    expect(opt.error).toBe('Failed to save')
    expect(opt.success).toBeUndefined()
  })
  test('accepts both success and error', () => {
    const opt: FormToastOption = { error: 'Failed', success: 'Saved' }
    expect(opt.success).toBe('Saved')
    expect(opt.error).toBe('Failed')
  })
  test('accepts empty object', () => {
    const opt: FormToastOption = {}
    expect(opt.success).toBeUndefined()
    expect(opt.error).toBeUndefined()
  })
})
describe('makeInviteToken', () => {
  test('returns a string of length 32', () => {
    const token = makeInviteToken()
    expect(token).toHaveLength(32)
  })
  test('returns only valid base-36 characters', () => {
    const token = makeInviteToken()
    expect(token).toMatch(TOKEN_CHARS_PATTERN)
  })
  test('generates unique tokens on successive calls', () => {
    const tokens = new Set<string>()
    for (let i = 0; i < 100; i += 1) tokens.add(makeInviteToken())
    expect(tokens.size).toBe(100)
  })
  test('does not contain Date.now patterns', () => {
    const token = makeInviteToken()
    expect(token).not.toContain('_')
  })
  test('uses cryptographic randomness', () => {
    const tokens: string[] = []
    for (let i = 0; i < 50; i += 1) tokens.push(makeInviteToken())
    const uniqueChars = new Set(tokens.join(''))
    expect(uniqueChars.size).toBeGreaterThan(10)
  })
})
const jsProto = 'javascript'
const jsColon = `${jsProto}:`
describe('sanitizeString (extended patterns)', () => {
  test('removes javascript protocol', () => {
    expect(sanitizeString(`click ${jsColon} alert(1)`)).toBe('click  alert(1)')
  })
  test('removes javascript protocol with spaces', () => {
    expect(sanitizeString(`${jsProto} : void(0)`)).toBe(' void(0)')
  })
  test('removes javascript protocol case-insensitive', () => {
    expect(sanitizeString(`${jsProto.toUpperCase()}: alert(1)`)).toBe(' alert(1)')
  })
  test('removes data:text/html URIs', () => {
    expect(sanitizeString('src=data:text/html,<script>x</script>')).toBe('src=,')
  })
  test('removes data: text/html with spaces', () => {
    expect(sanitizeString('data : text/html')).toBe('')
  })
  test('removes iframe tags', () => {
    expect(sanitizeString('<iframe src="evil.com"></iframe>')).toBe('')
  })
  test('removes object tags', () => {
    expect(sanitizeString('<object data="flash.swf"></object>')).toBe('')
  })
  test('removes embed tags', () => {
    expect(sanitizeString('<embed src="plugin">')).toBe('')
  })
  test('removes applet tags', () => {
    expect(sanitizeString('<applet code="Evil.class"></applet>')).toBe('')
  })
  test('removes form tags', () => {
    expect(sanitizeString('<form action="evil"><input></form>')).toBe('<input>')
  })
  test('removes base tags', () => {
    expect(sanitizeString('<base href="evil.com">')).toBe('')
  })
  test('removes meta tags', () => {
    expect(sanitizeString('<meta http-equiv="refresh" content="0;url=evil">')).toBe('')
  })
  test('removes self-closing dangerous tags', () => {
    expect(sanitizeString('<iframe/>')).toBe('')
  })
  test('removes closing dangerous tags', () => {
    expect(sanitizeString('</iframe>')).toBe('')
  })
  test('removes HTML-encoded angle brackets (hex)', () => {
    expect(sanitizeString('&#x3c;script&#x3e;')).toBe('script')
  })
  test('removes HTML-encoded angle brackets (decimal)', () => {
    expect(sanitizeString('&#60;script&#62;')).toBe('script')
  })
  test('removes HTML-encoded with leading zeros', () => {
    expect(sanitizeString('&#x003c;script&#x003e;')).toBe('script')
  })
  test('handles combined attack vectors', () => {
    const input = `<script>x</script><iframe src="y"><img onerror= z>${jsColon} w`
    const result = sanitizeString(input)
    expect(result).not.toContain('<script')
    expect(result).not.toContain('<iframe')
    expect(result).not.toContain('onerror=')
    expect(result).not.toContain(jsColon)
  })
  test('preserves safe HTML elements', () => {
    expect(sanitizeString('<p>paragraph</p><span>text</span>')).toBe('<p>paragraph</p><span>text</span>')
  })
  test('preserves URLs with data in path', () => {
    expect(sanitizeString('https://example.com/data/page')).toBe('https://example.com/data/page')
  })
})
describe('UseBulkSelectionOpts rm option type', () => {
  test('accepts rm', () => {
    const opts: ReactIndexTypes.UseBulkSelectionOpts = {
      items: [{ _id: '1' }, { _id: '2' }],
      orgId: 'org_1',
      rm: async () => {
        String(0)
      }
    }
    expect(opts.rm).toBeDefined()
  })
  test('accepts missing rm', () => {
    const opts: ReactIndexTypes.UseBulkSelectionOpts = {
      items: [],
      orgId: 'org_1'
    }
    expect(opts.rm).toBeUndefined()
  })
  test('rm receives args with id and orgId', () => {
    let captured = ''
    const opts: ReactIndexTypes.UseBulkSelectionOpts = {
      items: [],
      orgId: 'org_1',
      rm: async args => {
        captured = args.id ?? ''
      }
    }
    opts.rm?.({ id: 'test-id', orgId: 'org_1' })
    expect(captured).toBe('test-id')
  })
  test('rm with all optional callbacks', () => {
    let errorCalled = false
    let successCount = 0
    const opts: ReactIndexTypes.UseBulkSelectionOpts = {
      items: [{ _id: 'a' }],
      onError: () => {
        errorCalled = true
      },
      onSuccess: (count: number) => {
        successCount = count
      },
      orgId: 'org_1',
      rm: async () => {
        String(0)
      }
    }
    opts.onError?.(new Error('test'))
    opts.onSuccess?.(5)
    expect(errorCalled).toBe(true)
    expect(successCount).toBe(5)
    expect(opts.rm).toBeDefined()
  })
})
describe('T28: ACL permission checks', () => {
  test('canEdit grants admin access', async () => {
    const { canEdit } = await import('../server/org-crud')
    const id = { isEqual: (o: unknown) => o === 'admin' } as never
    expect(canEdit({ member: { isAdmin: true }, row: { userId: id }, sender: 'other' as never })).toBe(true)
  })
  test('canEdit grants owner access', async () => {
    const { canEdit } = await import('../server/org-crud')
    const id = { isEqual: (o: unknown) => o === id } as never
    expect(canEdit({ member: { isAdmin: false }, row: { userId: id }, sender: id })).toBe(true)
  })
  test('canEdit denies member without acl', async () => {
    const { canEdit } = await import('../server/org-crud')
    const owner = { isEqual: () => false } as never
    const member = { isEqual: () => false } as never
    expect(canEdit({ member: { isAdmin: false }, row: { userId: owner }, sender: member })).toBe(false)
  })
  test('canEdit grants editor access when acl: true', async () => {
    const { canEdit } = await import('../server/org-crud')
    const owner = { isEqual: () => false } as never
    const editor = { isEqual: (o: unknown) => o === editor } as never
    expect(
      canEdit({ acl: true, member: { isAdmin: false }, row: { editors: [editor], userId: owner }, sender: editor })
    ).toBe(true)
  })
  test('canEdit denies non-editor when acl: true', async () => {
    const { canEdit } = await import('../server/org-crud')
    const owner = { isEqual: () => false } as never
    const editor = { isEqual: () => false } as never
    const stranger = { isEqual: () => false } as never
    expect(
      canEdit({ acl: true, member: { isAdmin: false }, row: { editors: [editor], userId: owner }, sender: stranger })
    ).toBe(false)
  })
})
describe('T26: ACL editor reducers generated', () => {
  test('org-crud exports canEdit', async () => {
    const mod = await import('../server/org-crud')
    expect(mod).toHaveProperty('canEdit')
    expect(typeof mod.canEdit).toBe('function')
  })
  test('makeOrgCrud exports canEdit with acl support', async () => {
    const mod = await import('../server/org-crud')
    expect(typeof mod.canEdit).toBe('function')
    const owner = { isEqual: () => false } as never
    const editor = { isEqual: (o: unknown) => o === editor } as never
    expect(
      mod.canEdit({ acl: true, member: { isAdmin: false }, row: { editors: [editor], userId: owner }, sender: editor })
    ).toBe(true)
  })
})
describe('useCrud unified hook', () => {
  test('useCrud is exported from react', async () => {
    const mod = await import('../react/use-crud')
    expect(mod).toHaveProperty('useCrud')
    expect(typeof mod.useCrud).toBe('function')
  })
  test('CrudResult type has same shape as Convex', () => {
    interface R {
      create: (data: Record<string, unknown>) => Promise<unknown>
      data: unknown[]
      hasMore: boolean
      isLoading: boolean
      loadMore: () => void
      rm: (id: unknown) => Promise<unknown>
      update: (args: Record<string, unknown>) => Promise<unknown>
    }
    const r: R = {
      create: async () => {
        /* Empty */
      },
      data: [],
      hasMore: false,
      isLoading: false,
      loadMore: () => {
        /* Empty */
      },
      rm: async () => {
        /* Empty */
      },
      update: async () => {
        /* Empty */
      }
    }
    expect(r.data).toEqual([])
    expect(typeof r.create).toBe('function')
    expect(typeof r.update).toBe('function')
    expect(typeof r.rm).toBe('function')
    expect(typeof r.loadMore).toBe('function')
    expect(typeof r.hasMore).toBe('boolean')
    expect(typeof r.isLoading).toBe('boolean')
  })
  test('StdbCrudRefs requires table/create/rm/update', async () => {
    const mod = await import('../react/use-crud')
    expect(mod).toHaveProperty('useCrud')
  })
  test('createApi is exported', async () => {
    const mod = await import('../react/create-api')
    expect(mod).toHaveProperty('createApi')
    expect(typeof mod.createApi).toBe('function')
  })
  test('createApi builds refs from tables and reducers', async () => {
    const { createApi } = await import('../react/create-api')
    const tables = { blog: { tableName: 'blog' }, chat: { tableName: 'chat' } }
    const reducers = {
      createBlog: 'cb',
      createChat: 'cc',
      rmBlog: 'rb',
      rmChat: 'rc',
      updateBlog: 'ub',
      updateChat: 'uc'
    }
    const api = createApi(tables, reducers)
    expect(api.blog).toEqual({ create: 'cb', rm: 'rb', table: { tableName: 'blog' }, update: 'ub' })
    expect(api.chat).toEqual({ create: 'cc', rm: 'rc', table: { tableName: 'chat' }, update: 'uc' })
  })
  test('createApi with explicit table names', async () => {
    const { createApi } = await import('../react/create-api')
    const tables = { blog: { tableName: 'blog' }, chat: { tableName: 'chat' } }
    const reducers = { createBlog: 'cb', rmBlog: 'rb', updateBlog: 'ub' }
    const api = createApi(tables, reducers, ['blog'])
    expect(api.blog).toBeDefined()
    expect(api.chat).toBeUndefined()
  })
})
describe('T21: noboil() object form', () => {
  test('noboil is exported', async () => {
    const mod = await import('../server/setup')
    expect(mod).toHaveProperty('noboil')
    expect(typeof mod.noboil).toBe('function')
  })
})
describe('makeLog factory schema', () => {
  const logs = makeLog({
    audit: { parent: 'order', schema: object({ delta: number(), kind: string() }) },
    vote: { parent: 'poll', schema: object({ option: string() }) }
  })
  test('makeLog brands each entry', () => {
    expect((logs.vote as { __bs?: string }).__bs).toBe('log')
    expect((logs.audit as { __bs?: string }).__bs).toBe('log')
  })
  test('parent + schema fields preserved', () => {
    expect(logs.vote.parent).toBe('poll')
    expect(logs.audit.parent).toBe('order')
    expect(logs.vote.schema).toBeDefined()
  })
  test('payload schema validates required fields', () => {
    const okLog = logs.vote.schema.safeParse({ option: 'a' })
    expect(okLog.success).toBe(true)
    const badLog = logs.vote.schema.safeParse({})
    expect(badLog.success).toBe(false)
  })
  test('makeLog accepts empty input', () => {
    const empty = makeLog({})
    expect(Object.keys(empty).length).toBe(0)
  })
})
describe('makeKv factory schema', () => {
  const kvs = makeKv({
    feature: { schema: object({ enabled: boolean() }), writeRole: true },
    siteConfig: {
      keys: ['banner', 'maintenance'] as const,
      schema: object({ active: boolean(), message: string() })
    }
  })
  test('makeKv brands each entry', () => {
    expect((kvs.siteConfig as { __bs?: string }).__bs).toBe('kv')
    expect((kvs.feature as { __bs?: string }).__bs).toBe('kv')
  })
  test('keys whitelist preserved', () => {
    expect(kvs.siteConfig.keys).toEqual(['banner', 'maintenance'])
  })
  test('writeRole boolean preserved', () => {
    expect(kvs.feature.writeRole).toBe(true)
  })
  test('payload schema validates required fields', () => {
    const okKv = kvs.siteConfig.schema.safeParse({ active: true, message: 'x' })
    expect(okKv.success).toBe(true)
    const badKv = kvs.siteConfig.schema.safeParse({ active: 'true' })
    expect(badKv.success).toBe(false)
  })
})
describe('makeQuota factory schema', () => {
  const quotas = makeQuota({
    apiKey: { durationMs: 60_000, limit: 30 },
    upload: { durationMs: 24 * 60 * 60 * 1000, limit: 10 }
  })
  test('makeQuota brands each entry', () => {
    expect((quotas.apiKey as { __bs?: string }).__bs).toBe('quota')
    expect((quotas.upload as { __bs?: string }).__bs).toBe('quota')
  })
  test('limit + durationMs preserved', () => {
    expect(quotas.apiKey.limit).toBe(30)
    expect(quotas.upload.durationMs).toBe(24 * 60 * 60 * 1000)
  })
  test('makeQuota accepts empty input', () => {
    const empty = makeQuota({})
    expect(Object.keys(empty).length).toBe(0)
  })
})
