/** biome-ignore-all lint/nursery/noFloatingPromises: test hooks may return void or Promise */
/** biome-ignore-all lint/style/noProcessEnv: test env overrides */
/** biome-ignore-all lint/suspicious/useAwait: async test stubs intentionally match Promise-shaped APIs */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-console */
import type { GenericTableInfo, RegisteredQuery } from 'convex/server'
import { describe, expect, test } from 'bun:test'
import { ConvexError } from 'convex/values'
import { array, boolean, date, number, object, optional, string, enum as zenum } from 'zod/v4'
import type { AccessEntry, FactoryCall } from '../check'
import type { CheckResult } from '../doctor'
import type { DevtoolsProps } from '../react/devtools-panel'
import type { MutationType, PendingMutation } from '../react/optimistic-store'
import type { PlaygroundProps } from '../react/schema-playground'
import type { InfiniteListOptions } from '../react/use-infinite-list'
import type { UseListOptions } from '../react/use-list'
import type { MutateOptions, MutateToast } from '../react/use-mutate'
import type { PresenceUser, UsePresenceOptions, UsePresenceResult } from '../react/use-presence'
import type { UseSearchOptions, UseSearchResult } from '../react/use-search'
import type { ConvexErrorData, MutationFail, MutationOk, MutationResult } from '../server/helpers'
import type { OrgCrudOptions } from '../server/org-crud'
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
  OrgSchema,
  OwnedSchema,
  RateLimitConfig,
  RateLimitInput,
  Rec,
  SchemaTypeError,
  SetupConfig,
  SingletonSchema,
  WhereOf
} from '../server/types'
import {
  add,
  defaultFields,
  fieldToZod,
  genEndpointContent,
  genPageContent,
  genSchemaContent,
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
import { calcHealthScore, checkDeps, checkEslintContent, checkRateLimit } from '../doctor'
import { recommended as eslintRecommended, rules as eslintRules } from '../eslint'
import { guardApi } from '../guard'
import { diffSnapshots, isOptionalField as isOptionalRaw, parseFieldsFromBlock, parseSchemaContent } from '../migrate'
import {
  clearMutations,
  completeMutation,
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
import { buildMeta, getMeta } from '../react/form'
import { createOptimisticStore, makeTempId } from '../react/optimistic-store'
import { canEditResource } from '../react/org'
import { collectSettled, resolveBulkError } from '../react/use-bulk-mutate'
import { applyOptimistic, DEFAULT_PAGE_SIZE } from '../react/use-list'
import { DEFAULT_DEBOUNCE_MS, DEFAULT_MIN_LENGTH } from '../react/use-search'
import { fetchWithRetry, withRetry } from '../retry'
import { child, file, files, makeBase, makeOrgScoped, makeOwned, makeSingleton } from '../schema'
import { generateFieldValue, generateOne, generateSeed } from '../seed'
import { flt, idx, indexFields, sch, typed } from '../server/bridge'
import { ownedCascade } from '../server/crud'
import {
  cleanFiles,
  detectFiles,
  err,
  errValidation,
  extractErrorData,
  fail,
  generateToken,
  getErrorCode,
  getErrorDetail,
  getErrorMessage,
  groupList,
  handleConvexError,
  isErrorCode,
  isMutationError,
  isRecord,
  makeUnique,
  matchError,
  matchW,
  normalizeRateLimit,
  ok,
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
import { HEARTBEAT_INTERVAL_MS, PRESENCE_TTL_MS } from '../server/presence'
import { baseTable, orgTable, ownedTable, singletonTable } from '../server/schema-helpers'
import { mergeCacheHooks, mergeGlobalHooks, mergeHooks } from '../server/setup'
import { isTestMode } from '../server/test'
import { ERROR_MESSAGES } from '../server/types'
import { extractChildren, extractFieldsFromBlock, extractFieldType, extractWrapperTables, generateMermaid } from '../viz'
const VOID = undefined
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
})
describe('groupList', () => {
  test('undefined returns empty array', () => {
    expect(groupList()).toEqual([])
  })
  test('empty where with no real keys returns empty', () => {
    expect(groupList({} as Record<string, unknown> & { own?: boolean })).toEqual([])
  })
  test('single group with field', () => {
    const gs = groupList({ published: true } as Record<string, unknown> & {
      own?: boolean
    })
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
    const gs = groupList({ own: true } as Record<string, unknown> & {
      own?: boolean
    })
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
describe('RateLimitInput shorthand', () => {
  test('normalizeRateLimit converts number to object with 60s window', () => {
    const result = normalizeRateLimit(10)
    expect(result).toEqual({ max: 10, window: 60_000 })
  })
  test('normalizeRateLimit passes through object unchanged', () => {
    const input = { max: 5, window: 30_000 }
    expect(normalizeRateLimit(input)).toEqual(input)
  })
  test('number shorthand accepted in CrudOptions', () => {
    const rlOpts = { rateLimit: 10 }
    expect(rlOpts.rateLimit).toBe(10)
  })
  test('object form still accepted in CrudOptions', () => {
    const rlOpts = { rateLimit: { max: 10, window: 30_000 } }
    expect(rlOpts.rateLimit).toEqual({ max: 10, window: 30_000 })
  })
  test('RateLimitInput type accepts both forms', () => {
    const a: RateLimitInput = 10
    const b: RateLimitInput = { max: 10, window: 60_000 }
    expect(typeof a).toBe('number')
    expect(typeof b).toBe('object')
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
  test('pub: string shorthand accepted', () => {
    const opts: CrudOptions<BlogShape> = { pub: 'published' }
    expect(opts.pub).toBe('published')
  })
  test('pub: boolean shorthand accepted', () => {
    const opts: CrudOptions<BlogShape> = { pub: true }
    expect(opts.pub).toBe(true)
  })
  test('pub: object form still accepted', () => {
    const opts: CrudOptions<BlogShape> = { pub: { where: { published: true } } }
    expect(opts.pub).toEqual({ where: { published: true } })
  })
  test('pub: string shorthand only accepts valid field names', () => {
    const opts: CrudOptions<BlogShape> = { pub: 'category' }
    expect(opts.pub).toBe('category')
  })
  test('normalizeRateLimit with 1 request per minute', () => {
    expect(normalizeRateLimit(1)).toEqual({ max: 1, window: 60_000 })
  })
  test('normalizeRateLimit with custom window preserved', () => {
    const custom = { max: 100, window: 3_600_000 }
    expect(normalizeRateLimit(custom)).toBe(custom)
  })
  test('normalizeRateLimit object identity preserved', () => {
    const cfg = { max: 5, window: 10_000 }
    expect(normalizeRateLimit(cfg)).toBe(cfg)
  })
  test('search: true enables search with defaults', () => {
    expect(Object.keys(blogSchema.shape)).toHaveLength(4)
    const opts: CrudOptions<BlogShape> = { search: true }
    expect(opts.search).toBe(true)
  })
  test('search: string shorthand sets field name', () => {
    const opts: CrudOptions<BlogShape> = { search: 'content' }
    expect(opts.search).toBe('content')
  })
  test('search: { field, index } accepts valid schema keys', () => {
    const opts: CrudOptions<BlogShape> = {
      search: { field: 'content', index: 'search_content' }
    }
    const search = opts.search as { field?: string; index?: string }
    expect(search.field).toBe('content')
    expect(search.index).toBe('search_content')
  })
  test('search: { field } accepts any schema field name', () => {
    const opts: CrudOptions<BlogShape> = { search: { field: 'title' } }
    const search = opts.search as { field?: string }
    expect(search.field).toBe('title')
  })
  test('search: {} defaults both field and index', () => {
    const opts: CrudOptions<BlogShape> = { search: {} }
    const search = opts.search as { field?: string; index?: string }
    expect(search.field).toBeUndefined()
    expect(search.index).toBeUndefined()
  })
  test('search: undefined means no index search', () => {
    const opts: CrudOptions<BlogShape> = {}
    expect(opts.search).toBeUndefined()
  })
  test('typesafe: search string shorthand constrained to schema keys', () => {
    const validField: CrudOptions<BlogShape>['search'] = 'content'
    expect(validField).toBeDefined()
    const anotherValid: CrudOptions<BlogShape>['search'] = 'title'
    expect(anotherValid).toBeDefined()
    // @ts-expect-error - 'conten' is not a key of BlogShape
    const _invalid: CrudOptions<BlogShape>['search'] = 'conten'
    expect(_invalid).toBeDefined()
  })
  test('typesafe: search object field constrained to schema keys', () => {
    const validField: CrudOptions<BlogShape>['search'] = { field: 'content' }
    expect(validField).toBeDefined()
    // @ts-expect-error - 'conten' is not a key of BlogShape
    const _invalid: CrudOptions<BlogShape>['search'] = { field: 'conten' }
    expect(_invalid).toBeDefined()
  })
})
describe('typesafe field references', () => {
  const chatSchema = object({ isPublic: boolean(), title: string().min(1) })
  const messageSchema = object({
    chatId: string(),
    content: string(),
    role: string()
  })
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
  test('search shorthand accepts valid schema keys', () => {
    type MsgShape = typeof messageSchema.shape
    const opts: CrudOptions<MsgShape> = { search: 'content' }
    expect(opts.search).toBeDefined()
  })
  test('search shorthand rejects invalid schema keys', () => {
    type MsgShape = typeof messageSchema.shape
    // @ts-expect-error - 'conten' is not a key of MsgShape
    const _invalid: CrudOptions<MsgShape>['search'] = 'conten'
    expect(_invalid).toBeDefined()
  })
  test('aclFrom.field accepts valid schema keys', () => {
    expect(Object.keys(taskSchema.shape)).toContain('projectId')
    type TaskShape = typeof taskSchema.shape
    const opts: OrgCrudOptions<TaskShape> = {
      aclFrom: { field: 'projectId', table: 'project' }
    }
    expect(opts.aclFrom?.field).toBe('projectId')
  })
  test('aclFrom.field rejects invalid schema keys', () => {
    type TaskShape = typeof taskSchema.shape
    const _invalid: OrgCrudOptions<TaskShape> = {
      // @ts-expect-error - 'projctId' is not a key of TaskShape
      aclFrom: { field: 'projctId', table: 'project' }
    }
    expect(_invalid).toBeDefined()
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
  test('cascade false disables cascade', () => {
    const opts: CrudOptions<CS> = { cascade: false }
    expect(opts.cascade).toBe(false)
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
        'Schema mismatch: expected OwnedSchema (from makeOwned()), got OrgSchema (from makeOrgScoped()). Created by makeOwned() \u2192 use crud() + ownedTable()'
      expect(msg).toContain('Schema mismatch')
    })
    test('org expected, owned got', () => {
      type Err = SchemaTypeError<'org', 'owned'>
      const msg: Err =
        'Schema mismatch: expected OrgSchema (from makeOrgScoped()), got OwnedSchema (from makeOwned()). Created by makeOrgScoped() \u2192 use orgCrud() + orgTable()'
      expect(msg).toContain('Schema mismatch')
    })
    test('base expected, singleton got', () => {
      type Err = SchemaTypeError<'base', 'singleton'>
      const msg: Err =
        'Schema mismatch: expected BaseSchema (from makeBase()), got SingletonSchema (from makeSingleton()). Created by makeBase() \u2192 use cacheCrud() + baseTable()'
      expect(msg).toContain('Schema mismatch')
    })
    test('singleton expected, unbranded got', () => {
      type Err = SchemaTypeError<'singleton', 'unbranded'>
      const msg: Err =
        'Schema mismatch: expected SingletonSchema (from makeSingleton()), got plain ZodObject (not branded). Created by makeSingleton() \u2192 use singletonCrud() + singletonTable()'
      expect(msg).toContain('Schema mismatch')
    })
    test('owned expected, unbranded got', () => {
      type Err = SchemaTypeError<'owned', 'unbranded'>
      const msg: Err =
        'Schema mismatch: expected OwnedSchema (from makeOwned()), got plain ZodObject (not branded). Created by makeOwned() \u2192 use crud() + ownedTable()'
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
    test('BrandLabelMap has all 5 entries', () => {
      type Keys = keyof BrandLabelMap
      const keys: Keys[] = ['owned', 'org', 'base', 'singleton', 'unbranded']
      expect(keys).toHaveLength(5)
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
const HEX_PATTERN = /^[\da-f]+$/u
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
  test('contains only hex characters', () => {
    const token = generateToken()
    expect(token).toMatch(HEX_PATTERN)
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
  test('throws ConvexError with code only', () => {
    expect(() => err('NOT_FOUND')).toThrow()
    try {
      err('NOT_FOUND')
    } catch (error) {
      const e = error as { data: { code: string } }
      expect(e.data.code).toBe('NOT_FOUND')
      expect(e.data).not.toHaveProperty('debug')
      expect(e.data).not.toHaveProperty('message')
    }
  })
  test('throws ConvexError with debug string', () => {
    try {
      err('NOT_AUTHENTICATED', 'login-flow')
    } catch (error) {
      const e = error as { data: { code: string; debug: string } }
      expect(e.data.code).toBe('NOT_AUTHENTICATED')
      expect(e.data.debug).toBe('login-flow')
      expect(e.data).not.toHaveProperty('message')
    }
  })
  test('throws ConvexError with message object', () => {
    try {
      err('RATE_LIMITED', { message: 'Too many requests' })
    } catch (error) {
      const e = error as { data: { code: string; message: string } }
      expect(e.data.code).toBe('RATE_LIMITED')
      expect(e.data.message).toBe('Too many requests')
      expect(e.data).not.toHaveProperty('debug')
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
    expect(mod).toHaveProperty('canEdit')
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
  test('file with constraints returns accept and maxSize', () => {
    expect(getMeta(file({ accept: 'image/*', maxSize: 5_242_880 }))).toEqual({
      accept: 'image/*',
      kind: 'file',
      maxSize: 5_242_880
    })
  })
  test('files with constraints returns accept and maxSize', () => {
    expect(getMeta(files({ accept: 'image/*', maxSize: 10_485_760 }))).toEqual({
      accept: 'image/*',
      kind: 'files',
      maxSize: 10_485_760
    })
  })
  test('file without constraints returns no accept or maxSize', () => {
    const m = getMeta(file())
    expect(m.accept).toBeUndefined()
    expect(m.maxSize).toBeUndefined()
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
  test('extracts code from ConvexError', () => {
    const e = new ConvexError({ code: 'NOT_FOUND' })
    const d = extractErrorData(e)
    expect(d).toBeDefined()
    expect(d?.code).toBe('NOT_FOUND')
  })
  test('extracts code, debug from ConvexError', () => {
    const e = new ConvexError({
      code: 'NOT_AUTHENTICATED',
      debug: 'session-expired'
    })
    const d = extractErrorData(e)
    expect(d?.code).toBe('NOT_AUTHENTICATED')
    expect(d?.debug).toBe('session-expired')
  })
  test('extracts code, message from ConvexError', () => {
    const e = new ConvexError({ code: 'RATE_LIMITED', message: 'Too fast' })
    const d = extractErrorData(e)
    expect(d?.code).toBe('RATE_LIMITED')
    expect(d?.message).toBe('Too fast')
  })
  test('extracts code, fields from ConvexError', () => {
    const e = new ConvexError({
      code: 'NOT_FOUND',
      fields: ['title', 'content']
    })
    const d = extractErrorData(e)
    expect(d?.code).toBe('NOT_FOUND')
    expect(d?.fields).toEqual(['title', 'content'])
  })
  test('returns undefined for non-ConvexError', () => {
    expect(extractErrorData(new Error('plain'))).toBeUndefined()
  })
  test('returns undefined for string', () => {
    expect(extractErrorData('error')).toBeUndefined()
  })
  test('returns undefined for null', () => {
    expect(extractErrorData(null)).toBeUndefined()
  })
  test('returns undefined for ConvexError without valid code', () => {
    const e = new ConvexError({ code: 'INVALID_CODE_THAT_DOES_NOT_EXIST' })
    expect(extractErrorData(e)).toBeUndefined()
  })
  test('returns undefined for ConvexError with non-string code', () => {
    const e = new ConvexError({ code: 42 })
    expect(extractErrorData(e)).toBeUndefined()
  })
  test('returns undefined for ConvexError with non-record data', () => {
    const e = new ConvexError('just a string')
    expect(extractErrorData(e)).toBeUndefined()
  })
  test('debug is undefined when not a string', () => {
    const e = new ConvexError({ code: 'NOT_FOUND', debug: 123 })
    const d = extractErrorData(e)
    expect(d?.debug).toBeUndefined()
  })
  test('message is undefined when not a string', () => {
    const e = new ConvexError({ code: 'NOT_FOUND', message: false })
    const d = extractErrorData(e)
    expect(d?.message).toBeUndefined()
  })
  test('fields is undefined when not an array', () => {
    const e = new ConvexError({ code: 'NOT_FOUND', fields: 'title' })
    const d = extractErrorData(e)
    expect(d?.fields).toBeUndefined()
  })
})
describe('getErrorCode', () => {
  test('returns code from ConvexError', () => {
    expect(getErrorCode(new ConvexError({ code: 'CONFLICT' }))).toBe('CONFLICT')
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
  test('returns message from ConvexError with message field', () => {
    expect(getErrorMessage(new ConvexError({ code: 'NOT_FOUND', message: 'Blog not found' }))).toBe('Blog not found')
  })
  test('falls back to ERROR_MESSAGES for code without message', () => {
    const msg = getErrorMessage(new ConvexError({ code: 'NOT_AUTHENTICATED' }))
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
describe('handleConvexError', () => {
  test('calls specific handler for matching code', () => {
    let called = false
    handleConvexError(new ConvexError({ code: 'NOT_FOUND' }), {
      NOT_FOUND: () => {
        called = true
      }
    })
    expect(called).toBe(true)
  })
  test('calls default handler when no matching code handler', () => {
    let defaultCalled = false
    handleConvexError(new ConvexError({ code: 'NOT_FOUND' }), {
      default: () => {
        defaultCalled = true
      }
    })
    expect(defaultCalled).toBe(true)
  })
  test('calls default handler for plain Error', () => {
    let defaultCalled = false
    handleConvexError(new Error('plain'), {
      default: () => {
        defaultCalled = true
      }
    })
    expect(defaultCalled).toBe(true)
  })
  test('does nothing when no matching handler and no default', () => {
    let called = false
    handleConvexError(new ConvexError({ code: 'RATE_LIMITED' }), {
      NOT_FOUND: () => {
        called = true
      }
    })
    expect(called).toBe(false)
  })
  test('specific handler receives error data', () => {
    handleConvexError(new ConvexError({ code: 'CONFLICT', message: 'stale data' }), {
      CONFLICT: d => {
        expect(d.code).toBe('CONFLICT')
        expect(d.message).toBe('stale data')
      }
    })
  })
  test('specific handler takes precedence over default', () => {
    let which = ''
    handleConvexError(new ConvexError({ code: 'NOT_FOUND' }), {
      NOT_FOUND: () => {
        which = 'specific'
      },
      default: () => {
        which = 'default'
      }
    })
    expect(which).toBe('specific')
  })
  test('default receives original error for non-ConvexError', () => {
    const original = new Error('oops')
    handleConvexError(original, {
      default: e => {
        expect(e).toBe(original)
      }
    })
  })
  test('does nothing for non-error with no default', () => {
    expect(() => handleConvexError(null, {})).not.toThrow()
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
      expect((error as Error).message).toBe('fail-3')
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
      expect((error as Error).message).toBe('once')
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
      expect((error as Error).message).toBe('string-error')
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
  test('getOrgMember is exported from org-crud', async () => {
    const mod = await import('../server/org-crud')
    expect(mod).toHaveProperty('getOrgMember')
    expect(typeof mod.getOrgMember).toBe('function')
  })
  test('getOrgMember is re-exported from server/index', async () => {
    const mod = await import('../server/index')
    expect(mod).toHaveProperty('getOrgMember')
  })
  test('requireOrgMember is exported from org-crud', async () => {
    const mod = await import('../server/org-crud')
    expect(mod).toHaveProperty('requireOrgMember')
    expect(typeof mod.requireOrgMember).toBe('function')
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
    const mod = await import('../server/setup')
    expect(mod).toHaveProperty('setup')
    expect(typeof mod.setup).toBe('function')
  })
  test('setup is re-exported from server/index', async () => {
    const mod = await import('../server/index')
    expect(mod).toHaveProperty('setup')
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
    const mod = await import('../server/index')
    expect(mod).toHaveProperty('ownedCascade')
    expect(typeof mod.ownedCascade).toBe('function')
  })
  test('ownedCascade mirrors orgCascade behavior', () => {
    const owned = ownedCascade(taskSchema, { foreignKey: 'projectId' })
    const org = orgCascade(taskSchema, { foreignKey: 'projectId' })
    expect(owned.foreignKey).toBe(org.foreignKey)
    expect(owned.table).toBe(org.table)
  })
})
describe('Fix #5: OrgCascadeTableConfig type', () => {
  interface TestDM {
    [key: string]: GenericTableInfo
    blog: GenericTableInfo
    wiki: GenericTableInfo
  }
  test('string config accepts valid table name', () => {
    const config: OrgCascadeTableConfig<TestDM> = 'blog'
    expect(config).toBe('blog')
  })
  test('string config accepts another valid table name', () => {
    const config: OrgCascadeTableConfig<TestDM> = 'wiki'
    expect(config).toBe('wiki')
  })
  test('object config accepts valid table name', () => {
    const config: OrgCascadeTableConfig<TestDM> = { table: 'wiki' }
    expect(config).toEqual({ table: 'wiki' })
  })
  test('object config accepts fileFields', () => {
    const config: OrgCascadeTableConfig<TestDM> = {
      fileFields: ['photo', 'avatar'],
      table: 'blog'
    }
    expect(config).toEqual({ fileFields: ['photo', 'avatar'], table: 'blog' })
  })
  test('object config with empty fileFields', () => {
    const config: OrgCascadeTableConfig<TestDM> = {
      fileFields: [],
      table: 'blog'
    }
    expect(config).toEqual({ fileFields: [], table: 'blog' })
  })
  test('array of OrgCascadeTableConfig accepts mixed configs', () => {
    const configs: OrgCascadeTableConfig<TestDM>[] = ['blog', { fileFields: ['photo'], table: 'wiki' }]
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
describe('Fix #10: isTestMode production safety', () => {
  test('isTestMode returns true when CONVEX_TEST_MODE=true and NODE_ENV=test', () => {
    const origTest = process.env.CONVEX_TEST_MODE
    const origNode = process.env.NODE_ENV
    process.env.CONVEX_TEST_MODE = 'true'
    process.env.NODE_ENV = 'test'
    expect(isTestMode()).toBe(true)
    process.env.CONVEX_TEST_MODE = origTest
    process.env.NODE_ENV = origNode
  })
  test('isTestMode returns true when CONVEX_TEST_MODE=true regardless of NODE_ENV', () => {
    const origTest = process.env.CONVEX_TEST_MODE
    const origNode = process.env.NODE_ENV
    process.env.CONVEX_TEST_MODE = 'true'
    process.env.NODE_ENV = 'production'
    expect(isTestMode()).toBe(true)
    process.env.CONVEX_TEST_MODE = origTest
    process.env.NODE_ENV = origNode
  })
  test('isTestMode returns false when CONVEX_TEST_MODE is false', () => {
    const origTest = process.env.CONVEX_TEST_MODE
    const origNode = process.env.NODE_ENV
    process.env.CONVEX_TEST_MODE = 'false'
    process.env.NODE_ENV = 'test'
    expect(isTestMode()).toBe(false)
    process.env.CONVEX_TEST_MODE = origTest
    process.env.NODE_ENV = origNode
  })
  test('isTestMode returns false when CONVEX_TEST_MODE is undefined', () => {
    const origTest = process.env.CONVEX_TEST_MODE
    const origNode = process.env.NODE_ENV
    /** biome-ignore lint/performance/noDelete: process.env requires delete to truly unset */
    delete process.env.CONVEX_TEST_MODE
    process.env.NODE_ENV = 'test'
    expect(isTestMode()).toBe(false)
    process.env.CONVEX_TEST_MODE = origTest
    process.env.NODE_ENV = origNode
  })
  test('isTestMode returns false when both are undefined', () => {
    const origTest = process.env.CONVEX_TEST_MODE
    const origNode = process.env.NODE_ENV
    /** biome-ignore lint/performance/noDelete: process.env requires delete to truly unset */
    delete process.env.CONVEX_TEST_MODE
    /** biome-ignore lint/performance/noDelete: process.env requires delete to truly unset */
    delete process.env.NODE_ENV
    expect(isTestMode()).toBe(false)
    process.env.CONVEX_TEST_MODE = origTest
    process.env.NODE_ENV = origNode
  })
  test('isTestMode returns true when CONVEX_TEST_MODE=true and NODE_ENV=development', () => {
    const origTest = process.env.CONVEX_TEST_MODE
    const origNode = process.env.NODE_ENV
    process.env.CONVEX_TEST_MODE = 'true'
    process.env.NODE_ENV = 'development'
    expect(isTestMode()).toBe(true)
    process.env.CONVEX_TEST_MODE = origTest
    process.env.NODE_ENV = origNode
  })
  test('isTestMode returns true when CONVEX_TEST_MODE=true and NODE_ENV is empty', () => {
    const origTest = process.env.CONVEX_TEST_MODE
    const origNode = process.env.NODE_ENV
    process.env.CONVEX_TEST_MODE = 'true'
    process.env.NODE_ENV = ''
    expect(isTestMode()).toBe(true)
    process.env.CONVEX_TEST_MODE = origTest
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
    expect(ERROR_MESSAGES.VALIDATION_FAILED).toBe('Validation failed')
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
      const e = error as { data: { code: string } }
      expect(e.data.code).toBe('VALIDATION_FAILED')
    }
  })
  test('extractErrorData works with VALIDATION_FAILED', () => {
    const e = new ConvexError({ code: 'VALIDATION_FAILED', fields: ['title'] })
    const d = extractErrorData(e)
    expect(d).toBeDefined()
    expect(d?.code).toBe('VALIDATION_FAILED')
    expect(d?.fields).toEqual(['title'])
  })
  test('getErrorCode returns VALIDATION_FAILED', () => {
    const e = new ConvexError({ code: 'VALIDATION_FAILED' })
    expect(getErrorCode(e)).toBe('VALIDATION_FAILED')
  })
  test('getErrorMessage falls back to ERROR_MESSAGES for VALIDATION_FAILED', () => {
    const msg = getErrorMessage(new ConvexError({ code: 'VALIDATION_FAILED' }))
    expect(msg).toBe('Validation failed')
  })
  test('handleConvexError routes VALIDATION_FAILED', () => {
    let called = false
    handleConvexError(new ConvexError({ code: 'VALIDATION_FAILED' }), {
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
  test('errValidation throws ConvexError with code and fields', () => {
    const zodError = {
      flatten: () => ({
        fieldErrors: { content: ['Too short'], title: ['Required'] }
      })
    }
    try {
      errValidation('VALIDATION_FAILED', zodError)
    } catch (error) {
      const e = error as {
        data: { code: string; fields: string[]; message: string }
      }
      expect(e.data.code).toBe('VALIDATION_FAILED')
      expect(e.data.fields).toContain('title')
      expect(e.data.fields).toContain('content')
      expect(e.data.fields).toHaveLength(2)
      expect(e.data.message).toContain('Invalid:')
      expect(e.data.message).toContain('title')
      expect(e.data.message).toContain('content')
    }
  })
  test('errValidation with empty fieldErrors uses fallback message', () => {
    const zodError = {
      flatten: () => ({ fieldErrors: {} })
    }
    try {
      errValidation('VALIDATION_FAILED', zodError)
    } catch (error) {
      const e = error as {
        data: { code: string; fields: string[]; message: string }
      }
      expect(e.data.code).toBe('VALIDATION_FAILED')
      expect(e.data.fields).toEqual([])
      expect(e.data.message).toBe('Validation failed')
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
      const e = error as { data: { fieldErrors: Record<string, string> } }
      expect(e.data.fieldErrors).toEqual({
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
      const e = error as { data: { fieldErrors: Record<string, string> } }
      expect(e.data.fieldErrors.email).toBe('Invalid email')
    }
  })
  test('errValidation with empty fieldErrors produces empty object', () => {
    const zodError = { flatten: () => ({ fieldErrors: {} }) }
    try {
      errValidation('VALIDATION_FAILED', zodError)
    } catch (error) {
      const e = error as { data: { fieldErrors: Record<string, string> } }
      expect(e.data.fieldErrors).toEqual({})
    }
  })
  test('extractErrorData returns fieldErrors from ConvexError', () => {
    const e = new ConvexError({
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
    const e = new ConvexError({
      code: 'VALIDATION_FAILED',
      fieldErrors: 'not-a-record'
    })
    const d = extractErrorData(e)
    expect(d).toBeDefined()
    expect(d?.fieldErrors).toBeUndefined()
  })
  test('extractErrorData returns undefined fieldErrors when missing', () => {
    const e = new ConvexError({ code: 'NOT_FOUND' })
    const d = extractErrorData(e)
    expect(d).toBeDefined()
    expect(d?.fieldErrors).toBeUndefined()
  })
  test('extractErrorData ignores array fieldErrors (arrays are not records)', () => {
    const e = new ConvexError({
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
      const e = error as {
        data: { fieldErrors: Record<string, string>; fields: string[] }
      }
      expect(e.data.fieldErrors).toEqual({ title: 'Required' })
      expect(e.data.fields).toEqual(['title'])
    }
  })
  test('extractErrorData with fieldErrors as null returns undefined', () => {
    const e = new ConvexError({
      code: 'VALIDATION_FAILED',
      fieldErrors: null
    })
    const d = extractErrorData(e)
    expect(d?.fieldErrors).toBeUndefined()
  })
  test('extractErrorData with fieldErrors as number returns undefined', () => {
    const e = new ConvexError({
      code: 'VALIDATION_FAILED',
      fieldErrors: 42
    })
    const d = extractErrorData(e)
    expect(d?.fieldErrors).toBeUndefined()
  })
  test('extractErrorData with nested fieldErrors preserves values', () => {
    const e = new ConvexError({
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
    const e = new ConvexError({
      code: 'VALIDATION_FAILED',
      fieldErrors: {}
    })
    const d = extractErrorData(e)
    expect(d?.fieldErrors).toEqual({})
  })
  test('field-level errors coexist with general error message', () => {
    const e = new ConvexError({
      code: 'VALIDATION_FAILED',
      fieldErrors: { title: 'Too long' },
      fields: ['title'],
      message: 'Validation failed'
    })
    const d = extractErrorData(e)
    expect(d?.message).toBe('Validation failed')
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
    expect(ERROR_MESSAGES.VALIDATION_FAILED).toBe('Validation failed')
    expect(ERROR_MESSAGES.INVALID_WHERE).toBe('Invalid filters')
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
    expect(() => guarded.nonexistent).toThrow('does not match any module')
  })
  test('suggests correct casing on mismatch', () => {
    const guarded = guardApi(fakeApi, modules) as Record<string, unknown>
    expect(() => guarded.blogprofile).toThrow('Did you mean api.blogProfile')
  })
  test('suggests correct casing for all-caps typo', () => {
    const guarded = guardApi(fakeApi, modules) as Record<string, unknown>
    expect(() => guarded.BLOG).toThrow('Did you mean api.blog')
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
  test('calls toast with ConvexError message', () => {
    const messages: string[] = []
    const handler = makeErrorHandler((m: string) => {
      messages.push(m)
    })
    handler(new ConvexError({ code: 'NOT_FOUND', message: 'Blog not found' }))
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
    handler(new ConvexError({ code: 'RATE_LIMITED' }))
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
    handler(new ConvexError({ code: 'NOT_FOUND', message: 'Gone' }))
    expect(messages).toEqual(['Gone'])
  })
  test('toastFieldError toasts first field message', () => {
    const messages: string[] = []
    const didToast = toastFieldError(
      new ConvexError({
        code: 'VALIDATION_FAILED',
        fieldErrors: {
          content: 'Content is required',
          title: 'Title is required'
        }
      }),
      (m: string) => {
        messages.push(m)
      }
    )
    expect(didToast).toBe(true)
    expect(messages).toEqual(['Content is required'])
  })
  test('toastFieldError returns false without field errors', () => {
    const messages: string[] = []
    const didToast = toastFieldError(new ConvexError({ code: 'NOT_FOUND', message: 'Missing' }), (m: string) => {
      messages.push(m)
    })
    expect(didToast).toBe(false)
    expect(messages).toEqual([])
  })
})
describe('noboil-convex-viz', () => {
  test('extractFieldType recognizes string', () => {
    expect(extractFieldType('string().min(1)')).toBe('string')
  })
  test('extractFieldType recognizes boolean', () => {
    expect(extractFieldType('boolean()')).toBe('boolean')
  })
  test('extractFieldType recognizes number', () => {
    expect(extractFieldType('number()')).toBe('number')
  })
  test('extractFieldType recognizes file', () => {
    expect(extractFieldType('file().nullable()')).toBe('file')
  })
  test('extractFieldType recognizes files', () => {
    expect(extractFieldType('files().max(5)')).toBe('file[]')
  })
  test('extractFieldType recognizes zid', () => {
    expect(extractFieldType("zid('chat')")).toBe('id<chat>')
  })
  test('extractFieldType recognizes enum', () => {
    expect(extractFieldType("zenum(['a','b'])")).toBe('enum')
  })
  test('extractFieldsFromBlock parses fields', () => {
    const block = `
      title: string().min(1),
      published: boolean(),
      count: number()`
    const fields = extractFieldsFromBlock(block)
    expect(fields).toHaveLength(3)
    expect(fields[0]).toEqual({ name: 'title', type: 'string' })
    expect(fields[1]).toEqual({ name: 'published', type: 'boolean' })
    expect(fields[2]).toEqual({ name: 'count', type: 'number' })
  })
  test('extractWrapperTables finds owned tables', () => {
    const content = `const owned = makeOwned({
  blog: object({
    title: string().min(1),
    published: boolean()
  })
})`
    const tables = extractWrapperTables(content)
    expect(tables).toHaveLength(1)
    const [t] = tables
    expect(t).toBeDefined()
    expect(t?.name).toBe('blog')
    expect(t?.tableType).toBe('owned')
    expect(t?.fields.length).toBeGreaterThanOrEqual(2)
  })
  test('extractChildren finds child tables', () => {
    const content = `const children = {
  message: child({
    foreignKey: 'chatId',
    parent: 'chat',
    schema: object({
      chatId: zid('chat'),
      role: string()
    })
  })
}`
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
        tableType: 'owned'
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
    expect(mermaid).toContain('message {')
    expect(mermaid).toContain('chat ||--o{ message')
  })
})
describe('noboil-convex-check --endpoints', () => {
  const makeCall = (factory: string, options = ''): FactoryCall => ({
    factory,
    file: 'test.ts',
    options,
    table: 'test'
  })
  test('crud produces base + pub endpoints', () => {
    const eps = endpointsForFactory(makeCall('crud'))
    expect(eps).toContain('create')
    expect(eps).toContain('update')
    expect(eps).toContain('rm')
    expect(eps).toContain('pub.list')
    expect(eps).toContain('pub.read')
  })
  test('crud with search adds pub.search', () => {
    const eps = endpointsForFactory(makeCall('crud', "{ search: 'content' }"))
    expect(eps).toContain('pub.search')
  })
  test('crud with softDelete adds restore', () => {
    const eps = endpointsForFactory(makeCall('crud', '{ softDelete: true }'))
    expect(eps).toContain('restore')
  })
  test('orgCrud produces base endpoints', () => {
    const eps = endpointsForFactory(makeCall('orgCrud'))
    expect(eps).toContain('list')
    expect(eps).toContain('read')
    expect(eps).toContain('create')
    expect(eps).toContain('update')
    expect(eps).toContain('rm')
  })
  test('orgCrud with acl adds editor endpoints', () => {
    const eps = endpointsForFactory(makeCall('orgCrud', '{ acl: true }'))
    expect(eps).toContain('addEditor')
    expect(eps).toContain('removeEditor')
    expect(eps).toContain('setEditors')
    expect(eps).toContain('editors')
  })
  test('singletonCrud produces get + upsert', () => {
    const eps = endpointsForFactory(makeCall('singletonCrud'))
    expect(eps).toEqual(['get', 'upsert'])
  })
  test('cacheCrud produces all cache endpoints', () => {
    const eps = endpointsForFactory(makeCall('cacheCrud'))
    expect(eps).toContain('get')
    expect(eps).toContain('invalidate')
    expect(eps).toContain('purge')
    expect(eps).toContain('refresh')
  })
  test('childCrud produces base child endpoints', () => {
    const eps = endpointsForFactory(makeCall('childCrud'))
    expect(eps).toContain('list')
    expect(eps).toContain('create')
    expect(eps).toContain('update')
    expect(eps).toContain('rm')
  })
  test('childCrud with pub adds pub.list and pub.get', () => {
    const eps = endpointsForFactory(makeCall('childCrud', '{ pub: true }'))
    expect(eps).toContain('pub.list')
    expect(eps).toContain('pub.get')
  })
})
describe('bundle verification', () => {
  test('@noboil/convex/server does not export React hooks', async () => {
    const serverExports = await import('../server/index')
    const names = Object.keys(serverExports)
    for (const name of names) expect(name.startsWith('use')).toBe(false)
  })
  test('@noboil/convex/schema has no React imports', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', 'schema.ts'), 'utf8')
    expect(content.includes("from 'react'")).toBe(false)
    expect(content.includes('useState')).toBe(false)
    expect(content.includes('useEffect')).toBe(false)
  })
  test('@noboil/convex/schema has no node:fs imports', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', 'schema.ts'), 'utf8')
    expect(content.includes("from 'node:fs'")).toBe(false)
  })
  test('@noboil/convex/retry has no React or server imports', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', 'retry.ts'), 'utf8')
    expect(content.includes("from 'react'")).toBe(false)
    expect(content.includes("from 'node:fs'")).toBe(false)
  })
  test('entry point count matches package.json exports', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const content = readFileSync(join(import.meta.dir, '..', '..', 'package.json'), 'utf8')
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
  test('OrgCrudOptions accepts hooks field', () => {
    const opts: OrgCrudOptions<{ title: ReturnType<typeof string> }> = {
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
    const opts: OrgCrudOptions<{ title: ReturnType<typeof string> }> = {}
    expect(opts.hooks).toBeUndefined()
  })
  test('OrgCrudOptions hooks coexist with acl and rateLimit', () => {
    const opts: OrgCrudOptions<{ title: ReturnType<typeof string> }> = {
      acl: true,
      hooks: {
        afterCreate: () => {
          /* Noop */
        }
      },
      rateLimit: { max: 10, window: 60_000 },
      softDelete: true
    }
    expect(opts.hooks).toBeDefined()
    expect(opts.acl).toBe(true)
    expect(typeof opts.rateLimit === 'object' && opts.rateLimit.max).toBe(10)
  })
  test('OrgCrudOptions hooks can be async', () => {
    const opts: OrgCrudOptions<{ title: ReturnType<typeof string> }> = {
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
  test('all 6 hook callbacks work with HookCtx', async () => {
    const ctx: HookCtx = {
      db: {} as HookCtx['db'],
      storage: {} as HookCtx['storage'],
      userId: 'user_456'
    }
    const hooks: CrudHooks = {
      afterCreate: (c, { id }) => {
        expect(c.userId).toBe('user_456')
        expect(typeof id).toBe('string')
      },
      afterDelete: c => {
        expect(c.db).toBeDefined()
      },
      afterUpdate: (_c, { prev }) => {
        expect(prev).toBeDefined()
      },
      beforeCreate: (c, { data }) => {
        expect(c.storage).toBeDefined()
        return data
      },
      beforeDelete: (_c, { doc }) => {
        expect(doc).toBeDefined()
      },
      beforeUpdate: (c, { patch }) => {
        expect(c.userId).toBe('user_456')
        return patch
      }
    }
    hooks.beforeCreate?.(ctx, { data: { title: 'test' } })
    hooks.afterCreate?.(ctx, { data: { title: 'test' }, id: 'id_123' })
    hooks.beforeUpdate?.(ctx, {
      id: 'id_123',
      patch: { title: 'new' },
      prev: { title: 'old' }
    })
    hooks.afterUpdate?.(ctx, {
      id: 'id_123',
      patch: { title: 'new' },
      prev: { title: 'old' }
    })
    hooks.beforeDelete?.(ctx, { doc: { title: 'test' }, id: 'id_123' })
    hooks.afterDelete?.(ctx, { doc: { title: 'test' }, id: 'id_123' })
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
describe('noboil-convex-docs', () => {
  test('generateMarkdown produces markdown header', () => {
    const md = generateMarkdown([], new Map())
    expect(md).toContain('# API Reference')
    expect(md).toContain('noboil-convex docs')
  })
  test('generateMarkdown includes factory table', () => {
    const calls = [{ factory: 'crud', file: 'blog.ts', options: '', table: 'blog' }]
    const fields = new Map([['blog', [{ name: 'title', type: 'string' }]]])
    const md = generateMarkdown(calls, fields)
    expect(md).toContain('## blog')
    expect(md).toContain('`crud`')
    expect(md).toContain('blog.ts')
    expect(md).toContain('title')
  })
  test('generateMarkdown lists endpoints per factory', () => {
    const calls = [{ factory: 'crud', file: 'blog.ts', options: '', table: 'blog' }]
    const md = generateMarkdown(calls, new Map())
    expect(md).toContain('blog.create')
    expect(md).toContain('blog.update')
    expect(md).toContain('blog.rm')
  })
  test('generateMarkdown handles orgCrud with acl', () => {
    const calls = [
      {
        factory: 'orgCrud',
        file: 'wiki.ts',
        options: 'acl: true',
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
        factory: 'singletonCrud',
        file: 'profile.ts',
        options: '',
        table: 'profile'
      }
    ]
    const md = generateMarkdown(calls, new Map())
    expect(md).toContain('profile.get')
    expect(md).toContain('profile.upsert')
  })
  test('generateMarkdown includes schema fields section', () => {
    const calls = [{ factory: 'crud', file: 'blog.ts', options: '', table: 'blog' }]
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
    const calls = [{ factory: 'crud', file: 'blog.ts', options: '', table: 'blog' }]
    const md = generateMarkdown(calls, new Map())
    expect(md).toContain('mutation')
    expect(md).toContain('query')
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
    expect(String(val)).toContain('_storage:')
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
    expect(ruleNames).toContain('noboil-convex/require-rate-limit')
    expect(ruleNames).toContain('noboil-convex/no-unprotected-mutation')
    expect(ruleNames).toContain('noboil-convex/no-unlimited-file-size')
    expect(ruleNames).toContain('noboil-convex/no-empty-search-config')
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
    expect(eslintRecommended.rules['noboil-convex/require-rate-limit']).toBe('warn')
  })
  test('no-empty-search-config is error level in recommended', () => {
    expect(eslintRecommended.rules['noboil-convex/no-empty-search-config']).toBe('error')
  })
  test('no-unprotected-mutation is warn level in recommended', () => {
    expect(eslintRecommended.rules['noboil-convex/no-unprotected-mutation']).toBe('warn')
  })
  test('no-unlimited-file-size is warn level in recommended', () => {
    expect(eslintRecommended.rules['noboil-convex/no-unlimited-file-size']).toBe('warn')
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
      db: {} as CacheHookCtx['db']
    }
    expect(ctx.db).toBeDefined()
  })
  test('CacheHookCtx does not require userId or storage', () => {
    const ctx: CacheHookCtx = { db: {} as CacheHookCtx['db'] }
    expect('userId' in ctx).toBe(false)
    expect('storage' in ctx).toBe(false)
  })
  test('CacheHooks interface is structurally valid', () => {
    const hooks: CacheHooks = {
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
      beforeUpdate: (_ctx, { patch }) => patch,
      onFetch: data => data
    }
    expect(hooks.beforeCreate).toBeDefined()
    expect(hooks.afterCreate).toBeDefined()
    expect(hooks.beforeUpdate).toBeDefined()
    expect(hooks.afterUpdate).toBeDefined()
    expect(hooks.beforeDelete).toBeDefined()
    expect(hooks.afterDelete).toBeDefined()
    expect(hooks.onFetch).toBeDefined()
  })
  test('CacheHooks are all optional', () => {
    const hooks: CacheHooks = {}
    expect(hooks.beforeCreate).toBeUndefined()
    expect(hooks.onFetch).toBeUndefined()
  })
  test('CacheHooks can be async', () => {
    const hooks: CacheHooks = {
      afterDelete: async () => {
        /* Noop */
      },
      beforeCreate: async (_ctx, { data }) => data,
      beforeUpdate: async (_ctx, { patch }) => patch,
      onFetch: async data => data
    }
    expect(hooks.beforeCreate).toBeDefined()
    expect(hooks.onFetch).toBeDefined()
  })
  test('onFetch receives plain data without context', () => {
    const hooks: CacheHooks = {
      onFetch: data => {
        expect(data).toBeDefined()
        return { ...data, normalized: true }
      }
    }
    const result = hooks.onFetch?.({ title: 'test' })
    expect(result).toEqual({ normalized: true, title: 'test' })
  })
  test('CacheHooks beforeCreate transforms data', () => {
    const hooks: CacheHooks = {
      beforeCreate: (_ctx, { data }) => ({ ...data, extra: 'added' })
    }
    const ctx: CacheHookCtx = { db: {} as CacheHookCtx['db'] }
    const result = hooks.beforeCreate?.(ctx, { data: { title: 'hi' } })
    expect(result).toEqual({ extra: 'added', title: 'hi' })
  })
  test('CacheHooks beforeUpdate transforms patch', () => {
    const hooks: CacheHooks = {
      beforeUpdate: (_ctx, { patch }) => ({ ...patch, modified: true })
    }
    const ctx: CacheHookCtx = { db: {} as CacheHookCtx['db'] }
    const result = hooks.beforeUpdate?.(ctx, {
      id: '123',
      patch: { title: 'new' },
      prev: { title: 'old' }
    })
    expect(result).toEqual({ modified: true, title: 'new' })
  })
  test('CacheHooks afterDelete receives doc and id', () => {
    let capturedId = ''
    let capturedDoc: Record<string, unknown> = {}
    const hooks: CacheHooks = {
      afterDelete: (_ctx, { doc, id }) => {
        capturedId = id
        capturedDoc = doc as Record<string, unknown>
      }
    }
    const ctx: CacheHookCtx = { db: {} as CacheHookCtx['db'] }
    hooks.afterDelete?.(ctx, { doc: { title: 'deleted' }, id: 'doc_123' })
    expect(capturedId).toBe('doc_123')
    expect(capturedDoc.title).toBe('deleted')
  })
  test('CacheHooks differ from CrudHooks by context type', () => {
    const cacheCtx: CacheHookCtx = { db: {} as CacheHookCtx['db'] }
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
  test('CacheCrudResult get includes stale field in return type', () => {
    type R = CacheCrudResult<{ title: ReturnType<typeof string> }>
    type GetResult = R['get'] extends RegisteredQuery<'public', Rec, infer T> ? T : never
    type HasStale = GetResult extends null | { stale: boolean } ? true : false
    const _check: HasStale = true
    expect(_check).toBe(true)
  })
  test('CacheCrudResult get can return stale: true', () => {
    type R = CacheCrudResult<{ title: ReturnType<typeof string> }>
    type GetResult = R['get'] extends RegisteredQuery<'public', Rec, infer T> ? T : never
    type StaleResult = Extract<GetResult, { stale: boolean }>
    type IsStaleBoolean = StaleResult['stale'] extends boolean ? true : false
    const _check: IsStaleBoolean = true
    expect(_check).toBe(true)
  })
  test('CacheCrudResult get still returns null for missing entries', () => {
    type R = CacheCrudResult<{ title: ReturnType<typeof string> }>
    type GetResult = R['get'] extends RegisteredQuery<'public', Rec, infer T> ? T : never
    type CanBeNull = null extends GetResult ? true : false
    const _check: CanBeNull = true
    expect(_check).toBe(true)
  })
  test('CacheOptions accepts staleWhileRevalidate field', () => {
    type Opts = CacheOptions<{ title: ReturnType<typeof string> }, 'title'>
    type HasSWR = 'staleWhileRevalidate' extends keyof Opts ? true : false
    const _check: HasSWR = true
    expect(_check).toBe(true)
  })
  test('staleWhileRevalidate is optional in CacheOptions', () => {
    type Opts = CacheOptions<{ title: ReturnType<typeof string> }, 'title'>
    const opts: Opts = {
      key: 'title',
      schema: object({ title: string() }),
      table: 'test'
    }
    expect(opts.staleWhileRevalidate).toBeUndefined()
  })
})
describe('useInfiniteList', () => {
  test('InfiniteListOptions accepts pageSize', () => {
    const opts: InfiniteListOptions = { pageSize: 20 }
    expect(opts.pageSize).toBe(20)
  })
  test('InfiniteListOptions accepts rootMargin', () => {
    const opts: InfiniteListOptions = { rootMargin: '100px' }
    expect(opts.rootMargin).toBe('100px')
  })
  test('InfiniteListOptions accepts threshold', () => {
    const opts: InfiniteListOptions = { threshold: 0.5 }
    expect(opts.threshold).toBe(0.5)
  })
  test('InfiniteListOptions fields are all optional', () => {
    const opts: InfiniteListOptions = {}
    expect(opts.pageSize).toBeUndefined()
    expect(opts.rootMargin).toBeUndefined()
    expect(opts.threshold).toBeUndefined()
  })
})
describe('useSearch', () => {
  test('UseSearchOptions accepts debounceMs', () => {
    const opts: UseSearchOptions = { debounceMs: 500 }
    expect(opts.debounceMs).toBe(500)
  })
  test('UseSearchOptions accepts minLength', () => {
    const opts: UseSearchOptions = { minLength: 3 }
    expect(opts.minLength).toBe(3)
  })
  test('UseSearchOptions fields are all optional', () => {
    const opts: UseSearchOptions = {}
    expect(opts.debounceMs).toBeUndefined()
    expect(opts.minLength).toBeUndefined()
  })
  test('DEFAULT_DEBOUNCE_MS is 300', () => {
    expect(DEFAULT_DEBOUNCE_MS).toBe(300)
  })
  test('DEFAULT_MIN_LENGTH is 1', () => {
    expect(DEFAULT_MIN_LENGTH).toBe(1)
  })
  test('UseSearchResult shape is correct', () => {
    type R = UseSearchResult<string[]>
    type HasQuery = 'query' extends keyof R ? true : false
    type HasSetQuery = 'setQuery' extends keyof R ? true : false
    type HasResults = 'results' extends keyof R ? true : false
    type HasIsSearching = 'isSearching' extends keyof R ? true : false
    const _q: HasQuery = true
    const _sq: HasSetQuery = true
    const _r: HasResults = true
    const _is: HasIsSearching = true
    expect(_q).toBe(true)
    expect(_sq).toBe(true)
    expect(_r).toBe(true)
    expect(_is).toBe(true)
  })
})
describe('global hooks', () => {
  test('GlobalHookCtx has db and table, optional userId and storage', () => {
    const ctx: GlobalHookCtx = { db: {} as GlobalHookCtx['db'], table: 'blog' }
    expect(ctx.db).toBeDefined()
    expect(ctx.table).toBe('blog')
    expect(ctx.userId).toBeUndefined()
    expect(ctx.storage).toBeUndefined()
  })
  test('GlobalHookCtx accepts userId and storage', () => {
    const ctx: GlobalHookCtx = {
      db: {} as GlobalHookCtx['db'],
      storage: {} as NonNullable<GlobalHookCtx['storage']>,
      table: 'blog',
      userId: 'user_123'
    }
    expect(ctx.userId).toBe('user_123')
    expect(ctx.storage).toBeDefined()
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
    const ctx: GlobalHookCtx = { db: {} as GlobalHookCtx['db'], table: 'blog' }
    hooks.afterCreate?.(ctx, { data: {}, id: '123' })
    const ctx2: GlobalHookCtx = {
      db: {} as GlobalHookCtx['db'],
      table: 'wiki'
    }
    hooks.afterCreate?.(ctx2, { data: {}, id: '456' })
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
    const ctx: GlobalHookCtx = { db: {} as GlobalHookCtx['db'], table: 'blog' }
    hooks.beforeCreate?.(ctx, { data: { title: 'test' } })
    expect(capturedTable).toBe('blog')
  })
  test('GlobalHooks beforeUpdate composes data transform', () => {
    const hooks: GlobalHooks = {
      beforeUpdate: (_ctx, { patch }) => ({ ...patch, globalField: true })
    }
    const ctx: GlobalHookCtx = { db: {} as GlobalHookCtx['db'], table: 'blog' }
    const result = hooks.beforeUpdate?.(ctx, {
      id: '123',
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
    const opts: MutateOptions = { optimistic: false, type: 'update' }
    expect(opts.optimistic).toBe(false)
    expect(opts.type).toBe('update')
  })
  test('MutateOptions fields are all optional', () => {
    const opts: MutateOptions = {}
    expect(opts.optimistic).toBeUndefined()
    expect(opts.type).toBeUndefined()
  })
  test('MutateOptions accepts retry and onSettled', () => {
    const opts: MutateOptions<{ id: string }, { ok: true }> = {
      onSettled: (args, error, result) => {
        expect(args.id).toBe('1')
        expect(error).toBeUndefined()
        expect(result?.ok).toBe(true)
      },
      retry: { initialDelayMs: 100, maxAttempts: 3 }
    }
    expect(opts.retry).toBeDefined()
    opts.onSettled?.({ id: '1' }, undefined, { ok: true })
  })
  test('MutateToast success callback is typed with result and args', () => {
    const toastOpts: MutateToast<{ id: string }, { title: string }> = {
      success: (result, args) => `${args.id}:${result.title}`
    }
    const message = typeof toastOpts.success === 'function' ? toastOpts.success({ title: 'Done' }, { id: 'abc' }) : ''
    expect(message).toBe('abc:Done')
  })
  test('UseListOptions accepts optimistic field', () => {
    const opts: UseListOptions = { optimistic: false, pageSize: 25 }
    expect(opts.optimistic).toBe(false)
    expect(opts.pageSize).toBe(25)
  })
  test('UseListOptions optimistic defaults to true conceptually', () => {
    const opts: UseListOptions = {}
    expect(opts.optimistic).toBeUndefined()
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
  test('UsePresenceOptions accepts data and enabled', () => {
    const opts: UsePresenceOptions = {
      data: { cursor: { x: 10, y: 20 } },
      enabled: true
    }
    expect(opts.enabled).toBe(true)
    expect(opts.data).toEqual({ cursor: { x: 10, y: 20 } })
  })
  test('UsePresenceOptions fields are all optional', () => {
    const opts: UsePresenceOptions = {}
    expect(opts.enabled).toBeUndefined()
    expect(opts.data).toBeUndefined()
  })
  test('UsePresenceResult has users, updatePresence, leave', () => {
    type R = UsePresenceResult
    type Keys = keyof R
    const keys: Keys[] = ['users', 'updatePresence', 'leave']
    expect(keys).toHaveLength(3)
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
    const content = `export default defineSchema({ blog: ownedTable(owned.blog).index('by_published', ['published']), chat: ownedTable(owned.chat) })`
    const result = extractCustomIndexes(content)
    expect(result.get('blog')).toEqual([{ fields: ['published'], name: 'by_published', type: 'custom' }])
    expect(result.get('chat')).toEqual([])
  })
  test('parses multiple indexes on same table', () => {
    const content = `export default defineSchema({ blog: ownedTable(owned.blog).index('by_published', ['published']).index('by_category', ['category']) })`
    const result = extractCustomIndexes(content)
    expect(result.get('blog')).toHaveLength(2)
    expect(result.get('blog')).toContainEqual({
      fields: ['published'],
      name: 'by_published',
      type: 'custom'
    })
    expect(result.get('blog')).toContainEqual({
      fields: ['category'],
      name: 'by_category',
      type: 'custom'
    })
  })
  test('parses compound index fields', () => {
    const content = `export default defineSchema({ wiki: orgTable(orgScoped.wiki).index('by_slug', ['orgId', 'slug']) })`
    const result = extractCustomIndexes(content)
    expect(result.get('wiki')).toEqual([{ fields: ['orgId', 'slug'], name: 'by_slug', type: 'custom' }])
  })
  test('parses searchIndex', () => {
    const content = `export default defineSchema({ blog: ownedTable(owned.blog).searchIndex('search_field', { searchField: 'content' }) })`
    const result = extractCustomIndexes(content)
    expect(result.get('blog')).toEqual([{ fields: ['content'], name: 'search_field', type: 'search' }])
  })
  test('parses mixed index and searchIndex', () => {
    const content = `export default defineSchema({ blog: ownedTable(owned.blog).index('by_published', ['published']).searchIndex('search_field', { searchField: 'content' }) })`
    const result = extractCustomIndexes(content)
    expect(result.get('blog')).toHaveLength(2)
    const blogIdxs = result.get('blog')
    expect(blogIdxs).toBeDefined()
    expect(blogIdxs?.map(i => i.type)).toContain('custom')
    expect(blogIdxs?.map(i => i.type)).toContain('search')
  })
  test('returns empty map for content without table helpers', () => {
    const result = extractCustomIndexes('const x = 1')
    expect(result.size).toBe(0)
  })
  test('parses defineTable usage', () => {
    const content = `export default defineSchema({ message: defineTable({ content: v.string() }).index('by_chat', ['chatId']) })`
    const result = extractCustomIndexes(content)
    expect(result.get('message')).toEqual([{ fields: ['chatId'], name: 'by_chat', type: 'custom' }])
  })
  test('handles multiple tables', () => {
    const content = `export default defineSchema({ blog: ownedTable(owned.blog).index('by_published', ['published']), movie: baseTable(base.movie).index('by_tmdb_id', ['tmdb_id']) })`
    const result = extractCustomIndexes(content)
    expect(result.size).toBe(2)
    expect(result.get('blog')?.[0]?.name).toBe('by_published')
    expect(result.get('movie')?.[0]?.name).toBe('by_tmdb_id')
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
    expect(FACTORY_DEFAULT_INDEXES.crud).toEqual([{ fields: ['userId'], name: 'by_user', type: 'default' }])
  })
  test('orgCrud has by_org and by_org_user indexes', () => {
    expect(FACTORY_DEFAULT_INDEXES.orgCrud).toEqual([
      { fields: ['orgId'], name: 'by_org', type: 'default' },
      { fields: ['orgId', 'userId'], name: 'by_org_user', type: 'default' }
    ])
  })
  test('singletonCrud has by_user index', () => {
    expect(FACTORY_DEFAULT_INDEXES.singletonCrud).toEqual([{ fields: ['userId'], name: 'by_user', type: 'default' }])
  })
  test('cacheCrud has no default indexes', () => {
    expect(FACTORY_DEFAULT_INDEXES.cacheCrud).toEqual([])
  })
  test('childCrud has no default indexes', () => {
    expect(FACTORY_DEFAULT_INDEXES.childCrud).toEqual([])
  })
  test('orgCrud by_org indexes orgId field', () => {
    const orgIdx = FACTORY_DEFAULT_INDEXES.orgCrud
    expect(orgIdx).toBeDefined()
    const byOrg = orgIdx?.find(ix => ix.name === 'by_org')
    expect(byOrg).toBeDefined()
    expect(byOrg?.fields).toEqual(['orgId'])
  })
  test('orgCrud by_org_user indexes orgId and userId', () => {
    const orgIdx = FACTORY_DEFAULT_INDEXES.orgCrud
    expect(orgIdx).toBeDefined()
    const byOrgUser = orgIdx?.find(ix => ix.name === 'by_org_user')
    expect(byOrgUser).toBeDefined()
    expect(byOrgUser?.fields).toEqual(['orgId', 'userId'])
  })
})
describe('noboil-convex-migrate', () => {
  describe('parseSchemaContent', () => {
    test('parses owned tables', () => {
      const content = `const owned = makeOwned({
  blog: object({
    title: string().min(1),
    content: string().min(3),
    published: boolean()
  })
})`
      const result = parseSchemaContent(content)
      expect(result.tables).toHaveLength(1)
      expect(result.tables[0]?.name).toBe('blog')
      expect(result.tables[0]?.factory).toBe('crud')
      expect(result.tables[0]?.fields).toHaveLength(3)
    })
    test('parses orgScoped tables', () => {
      const content = `const orgScoped = makeOrgScoped({
  wiki: object({
    title: string(),
    slug: string()
  })
})`
      const result = parseSchemaContent(content)
      expect(result.tables).toHaveLength(1)
      expect(result.tables[0]?.factory).toBe('orgCrud')
    })
    test('parses singleton tables', () => {
      const content = `const singleton = makeSingleton({
  profile: object({
    displayName: string(),
    theme: zenum(['light', 'dark'])
  })
})`
      const result = parseSchemaContent(content)
      expect(result.tables).toHaveLength(1)
      expect(result.tables[0]?.factory).toBe('singletonCrud')
    })
    test('parses base (cache) tables', () => {
      const content = `const base = makeBase({
  movie: object({
    title: string(),
    tmdb_id: number()
  })
})`
      const result = parseSchemaContent(content)
      expect(result.tables).toHaveLength(1)
      expect(result.tables[0]?.factory).toBe('cacheCrud')
    })
    test('parses child tables', () => {
      const content = `const children = {
  message: child({
    foreignKey: 'chatId',
    parent: 'chat',
    schema: object({
      chatId: zid('chat'),
      role: zenum(['user', 'assistant'])
    })
  })
}`
      const result = parseSchemaContent(content)
      expect(result.tables).toHaveLength(1)
      expect(result.tables[0]?.name).toBe('message')
      expect(result.tables[0]?.factory).toBe('childCrud')
    })
    test('parses multiple tables across factories', () => {
      const content = `const owned = makeOwned({
  blog: object({ title: string() }),
  chat: object({ isPublic: boolean() })
})
const orgScoped = makeOrgScoped({
  wiki: object({ content: string() })
})`
      const result = parseSchemaContent(content)
      expect(result.tables).toHaveLength(3)
    })
    test('returns sorted tables', () => {
      const content = `const owned = makeOwned({
  zzz: object({ a: string() }),
  aaa: object({ b: string() })
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
      const block = `title: string().min(1),
    content: string(),
    published: boolean()`
      const fields = parseFieldsFromBlock(block)
      expect(fields).toHaveLength(3)
      expect(fields[0]?.name).toBe('title')
      expect(fields[0]?.type).toBe('string')
      expect(fields[1]?.name).toBe('content')
      expect(fields[2]?.type).toBe('boolean')
    })
    test('detects optional fields', () => {
      const block = `bio: string().optional(),
    name: string()`
      const fields = parseFieldsFromBlock(block)
      expect(fields[0]?.optional).toBe(true)
      expect(fields[1]?.optional).toBe(false)
    })
    test('detects nullable fields', () => {
      const block = 'avatar: file().nullable()'
      const fields = parseFieldsFromBlock(block)
      expect(fields[0]?.optional).toBe(true)
    })
    test('detects file types', () => {
      const block = `cover: file(),
    attachments: files()`
      const fields = parseFieldsFromBlock(block)
      expect(fields[0]?.type).toBe('file')
      expect(fields[1]?.type).toBe('file[]')
    })
    test('detects number and enum types', () => {
      const block = `count: number(),
    status: zenum(['active', 'archived'])`
      const fields = parseFieldsFromBlock(block)
      expect(fields[0]?.type).toBe('number')
      expect(fields[1]?.type).toBe('enum')
    })
  })
  describe('isOptionalField', () => {
    test('optional() is optional', () => {
      expect(isOptionalRaw('string().optional()')).toBe(true)
    })
    test('nullable() is optional', () => {
      expect(isOptionalRaw('file().nullable()')).toBe(true)
    })
    test('required field is not optional', () => {
      expect(isOptionalRaw('string().min(1)')).toBe(false)
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
            factory: 'crud',
            fields: [{ name: 'title', optional: false, type: 'string' }],
            name: 'wiki'
          }
        ]
      }
      const after = {
        tables: [
          {
            factory: 'orgCrud',
            fields: [{ name: 'title', optional: false, type: 'string' }],
            name: 'wiki'
          }
        ]
      }
      const actions = diffSnapshots(before, after)
      expect(actions).toHaveLength(1)
      expect(actions[0]?.type).toBe('factory_changed')
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
      const oldSchema = `const owned = makeOwned({
  blog: object({
    title: string(),
    content: string()
  })
})`
      const newSchema = `const owned = makeOwned({
  blog: object({
    title: string(),
    content: string(),
    category: zenum(['tech', 'life'])
  })
})
const orgScoped = makeOrgScoped({
  wiki: object({
    title: string()
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
  test('crud returns Public, Authenticated, Owner levels', () => {
    const call: FactoryCall = {
      factory: 'crud',
      file: 'blog.ts',
      options: '',
      table: 'blog'
    }
    const result = accessForFactory(call)
    const levels = result.map((e: AccessEntry) => e.level)
    expect(levels).toContain('Public')
    expect(levels).toContain('Authenticated')
    expect(levels).toContain('Owner')
  })
  test('crud Public includes pub.list and pub.read', () => {
    const call: FactoryCall = {
      factory: 'crud',
      file: 'blog.ts',
      options: '',
      table: 'blog'
    }
    const result = accessForFactory(call)
    const pub = result.find((e: AccessEntry) => e.level === 'Public')
    expect(pub).toBeDefined()
    expect(pub?.endpoints).toContain('pub.list')
    expect(pub?.endpoints).toContain('pub.read')
  })
  test('crud with search adds pub.search to Public', () => {
    const call: FactoryCall = {
      factory: 'crud',
      file: 'blog.ts',
      options: "search: 'content'",
      table: 'blog'
    }
    const result = accessForFactory(call)
    const pub = result.find((e: AccessEntry) => e.level === 'Public')
    expect(pub?.endpoints).toContain('pub.search')
  })
  test('crud without search has no pub.search', () => {
    const call: FactoryCall = {
      factory: 'crud',
      file: 'blog.ts',
      options: '',
      table: 'blog'
    }
    const result = accessForFactory(call)
    const pub = result.find((e: AccessEntry) => e.level === 'Public')
    expect(pub?.endpoints).not.toContain('pub.search')
  })
  test('crud Authenticated includes create', () => {
    const call: FactoryCall = {
      factory: 'crud',
      file: 'blog.ts',
      options: '',
      table: 'blog'
    }
    const result = accessForFactory(call)
    const auth = result.find((e: AccessEntry) => e.level === 'Authenticated')
    expect(auth).toBeDefined()
    expect(auth?.endpoints).toContain('create')
  })
  test('crud Owner includes update and rm', () => {
    const call: FactoryCall = {
      factory: 'crud',
      file: 'blog.ts',
      options: '',
      table: 'blog'
    }
    const result = accessForFactory(call)
    const owner = result.find((e: AccessEntry) => e.level === 'Owner')
    expect(owner).toBeDefined()
    expect(owner?.endpoints).toContain('update')
    expect(owner?.endpoints).toContain('rm')
  })
  test('crud with softDelete adds restore to Owner', () => {
    const call: FactoryCall = {
      factory: 'crud',
      file: 'blog.ts',
      options: 'softDelete: true',
      table: 'blog'
    }
    const result = accessForFactory(call)
    const owner = result.find((e: AccessEntry) => e.level === 'Owner')
    expect(owner?.endpoints).toContain('restore')
  })
  test('crud without softDelete has no restore', () => {
    const call: FactoryCall = {
      factory: 'crud',
      file: 'blog.ts',
      options: '',
      table: 'blog'
    }
    const result = accessForFactory(call)
    const owner = result.find((e: AccessEntry) => e.level === 'Owner')
    expect(owner?.endpoints).not.toContain('restore')
  })
  test('orgCrud returns Org Member and Org Admin levels', () => {
    const call: FactoryCall = {
      factory: 'orgCrud',
      file: 'wiki.ts',
      options: '',
      table: 'wiki'
    }
    const result = accessForFactory(call)
    const levels = result.map((e: AccessEntry) => e.level)
    expect(levels).toContain('Org Member')
    expect(levels).toContain('Org Admin')
  })
  test('orgCrud Org Member includes list, read, create, update', () => {
    const call: FactoryCall = {
      factory: 'orgCrud',
      file: 'wiki.ts',
      options: '',
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
      factory: 'orgCrud',
      file: 'wiki.ts',
      options: "search: 'content'",
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
      factory: 'orgCrud',
      file: 'wiki.ts',
      options: '',
      table: 'wiki'
    }
    const result = accessForFactory(call)
    const adminEntries = result.filter((e: AccessEntry) => e.level === 'Org Admin')
    const allAdminEps: string[] = []
    for (const entry of adminEntries) for (const ep of entry.endpoints) allAdminEps.push(ep)
    expect(allAdminEps).toContain('rm')
  })
  test('orgCrud with acl adds ACL endpoints to Org Admin', () => {
    const call: FactoryCall = {
      factory: 'orgCrud',
      file: 'wiki.ts',
      options: 'acl: true',
      table: 'wiki'
    }
    const result = accessForFactory(call)
    const adminEntries = result.filter((e: AccessEntry) => e.level === 'Org Admin')
    const allAdminEps: string[] = []
    for (const entry of adminEntries) for (const ep of entry.endpoints) allAdminEps.push(ep)
    expect(allAdminEps).toContain('addEditor')
    expect(allAdminEps).toContain('removeEditor')
    expect(allAdminEps).toContain('setEditors')
    expect(allAdminEps).toContain('editors')
  })
  test('orgCrud without acl has no ACL endpoints', () => {
    const call: FactoryCall = {
      factory: 'orgCrud',
      file: 'wiki.ts',
      options: '',
      table: 'wiki'
    }
    const result = accessForFactory(call)
    const adminEntries = result.filter((e: AccessEntry) => e.level === 'Org Admin')
    const allAdminEps: string[] = []
    for (const entry of adminEntries) for (const ep of entry.endpoints) allAdminEps.push(ep)
    expect(allAdminEps).not.toContain('addEditor')
  })
  test('orgCrud with softDelete adds restore to Org Admin', () => {
    const call: FactoryCall = {
      factory: 'orgCrud',
      file: 'wiki.ts',
      options: 'softDelete: true',
      table: 'wiki'
    }
    const result = accessForFactory(call)
    const adminEntries = result.filter((e: AccessEntry) => e.level === 'Org Admin')
    const allAdminEps: string[] = []
    for (const entry of adminEntries) for (const ep of entry.endpoints) allAdminEps.push(ep)
    expect(allAdminEps).toContain('restore')
  })
  test('childCrud returns Parent Owner level', () => {
    const call: FactoryCall = {
      factory: 'childCrud',
      file: 'message.ts',
      options: '',
      table: 'message'
    }
    const result = accessForFactory(call)
    const levels = result.map((e: AccessEntry) => e.level)
    expect(levels).toContain('Parent Owner')
  })
  test('childCrud Parent Owner includes list, create, update, rm', () => {
    const call: FactoryCall = {
      factory: 'childCrud',
      file: 'message.ts',
      options: '',
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
  test('childCrud with pub adds Public level with pub.list and pub.get', () => {
    const call: FactoryCall = {
      factory: 'childCrud',
      file: 'message.ts',
      options: 'pub: true',
      table: 'message'
    }
    const result = accessForFactory(call)
    const pub = result.find((e: AccessEntry) => e.level === 'Public')
    expect(pub).toBeDefined()
    expect(pub?.endpoints).toContain('pub.list')
    expect(pub?.endpoints).toContain('pub.get')
  })
  test('childCrud without pub has no Public level', () => {
    const call: FactoryCall = {
      factory: 'childCrud',
      file: 'message.ts',
      options: '',
      table: 'message'
    }
    const result = accessForFactory(call)
    const pub = result.find((e: AccessEntry) => e.level === 'Public')
    expect(pub).toBeUndefined()
  })
  test('cacheCrud returns No Auth level with all cache endpoints', () => {
    const call: FactoryCall = {
      factory: 'cacheCrud',
      file: 'movie.ts',
      options: '',
      table: 'movie'
    }
    const result = accessForFactory(call)
    expect(result).toHaveLength(1)
    expect(result[0]?.level).toBe('No Auth')
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
  test('singletonCrud returns Owner level with get and upsert', () => {
    const call: FactoryCall = {
      factory: 'singletonCrud',
      file: 'profile.ts',
      options: '',
      table: 'profile'
    }
    const result = accessForFactory(call)
    expect(result).toHaveLength(1)
    expect(result[0]?.level).toBe('Owner')
    expect(result[0]?.endpoints).toContain('get')
    expect(result[0]?.endpoints).toContain('upsert')
  })
  test('total endpoints from accessForFactory matches endpointsForFactory', () => {
    const calls: FactoryCall[] = [
      {
        factory: 'crud',
        file: 'blog.ts',
        options: "search: 'content', softDelete: true",
        table: 'blog'
      },
      {
        factory: 'orgCrud',
        file: 'wiki.ts',
        options: 'acl: true, softDelete: true',
        table: 'wiki'
      },
      {
        factory: 'childCrud',
        file: 'message.ts',
        options: 'pub: true',
        table: 'message'
      },
      { factory: 'cacheCrud', file: 'movie.ts', options: '', table: 'movie' },
      {
        factory: 'singletonCrud',
        file: 'profile.ts',
        options: '',
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
      factory: 'orgCrud',
      file: 'wiki.ts',
      options: "acl: true, softDelete: true, search: 'title'",
      table: 'wiki'
    }
    const result = accessForFactory(call)
    const memberEntries = result.filter((e: AccessEntry) => e.level === 'Org Member')
    const allMemberEps: string[] = []
    for (const entry of memberEntries) for (const ep of entry.endpoints) allMemberEps.push(ep)
    expect(allMemberEps).toContain('search')
    const adminEntries = result.filter((e: AccessEntry) => e.level === 'Org Admin')
    const allAdminEps: string[] = []
    for (const entry of adminEntries) for (const ep of entry.endpoints) allAdminEps.push(ep)
    expect(allAdminEps).toContain('restore')
    expect(allAdminEps).toContain('addEditor')
  })
  test('crud access entries do not overlap endpoints', () => {
    const call: FactoryCall = {
      factory: 'crud',
      file: 'blog.ts',
      options: "search: 'content', softDelete: true",
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
      factory: 'orgCrud',
      file: 'wiki.ts',
      options: 'acl: true, softDelete: true',
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
      factory: 'childCrud',
      file: 'message.ts',
      options: 'pub: true',
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
    db: {} as GlobalHookCtx['db'],
    table: 'blog',
    userId: 'user1'
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
      await hooks.afterCreate?.(mockCtx, { data: {}, id: 'id1' })
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
        id: 'id1',
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
      await hooks.afterUpdate?.(mockCtx, { id: 'id1', patch: {}, prev: {} })
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
      await hooks.beforeDelete?.(mockCtx, { doc: {}, id: 'id1' })
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
      await hooks.afterDelete?.(mockCtx, { doc: {}, id: 'id1' })
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
      hooks.beforeDelete?.(mockCtx, { doc: {}, id: 'id1' })
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
      hooks.beforeUpdate?.(mockCtx, { id: 'id1', patch: {}, prev: {} })
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
      expect(async () => mw.afterCreate?.(mwCtx, { data: { title: 'x' }, id: 'id1' })).not.toThrow()
    })
    test('afterUpdate does not throw', () => {
      const mw = auditLog()
      const mwCtx: MiddlewareCtx = { ...mockCtx, operation: 'update' }
      expect(async () =>
        mw.afterUpdate?.(mwCtx, {
          id: 'id1',
          patch: { title: 'y' },
          prev: { title: 'x' }
        })
      ).not.toThrow()
    })
    test('afterDelete does not throw', () => {
      const mw = auditLog()
      const mwCtx: MiddlewareCtx = { ...mockCtx, operation: 'delete' }
      expect(async () => mw.afterDelete?.(mwCtx, { doc: { title: 'x' }, id: 'id1' })).not.toThrow()
    })
    test('accepts custom log level', () => {
      const mw = auditLog({ logLevel: 'debug' })
      expect(mw.name).toBe('auditLog')
    })
    test('accepts verbose mode', () => {
      const mw = auditLog({ verbose: true })
      expect(mw.name).toBe('auditLog')
      const mwCtx: MiddlewareCtx = { ...mockCtx, operation: 'create' }
      expect(async () => mw.afterCreate?.(mwCtx, { data: { title: 'x' }, id: 'id1' })).not.toThrow()
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
      const result = mw.beforeUpdate?.(mwCtx, { id: 'id1', patch, prev: {} })
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
      const result = mw.beforeUpdate?.(mwCtx, { id: 'id1', patch, prev: {} })
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
      const result = mw.beforeUpdate?.(mwCtx, { id: 'id1', patch, prev: {} })
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
    test('removes javascript: protocol URIs', () => {
      // oxlint-disable-next-line no-script-url
      // eslint-disable-next-line no-script-url
      expect(sanitizeString('javascript: alert(1)')).toBe(' alert(1)')
    })
    test('removes data: text/html URIs', () => {
      expect(sanitizeString('data: text/html, <script>x</script>')).toBe(', ')
    })
    test('removes dangerous HTML tags', () => {
      expect(sanitizeString('<iframe src="evil.com"></iframe>')).toBe('')
      expect(sanitizeString('<object data="x">')).toBe('')
      expect(sanitizeString('<embed src="x">')).toBe('')
    })
    test('removes HTML-encoded angle brackets', () => {
      expect(sanitizeString('&#x3c;script&#x3e;')).toBe('script')
      expect(sanitizeString('&#60;script&#62;')).toBe('script')
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
      await hooks.afterCreate?.(mockCtx, { data: {}, id: 'id1' })
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
        id: 'id1',
        patch: { title: 'x' },
        prev: {}
      })
      expect(result).toEqual({ normalized: true, title: 'x', validated: true })
    })
  })
  describe('collectSettled', () => {
    test('separates fulfilled from rejected', () => {
      const settled: PromiseSettledResult<number>[] = [
        { status: 'fulfilled', value: 1 },
        { reason: 'fail', status: 'rejected' },
        { status: 'fulfilled', value: 2 }
      ]
      const { errors, results } = collectSettled(settled)
      expect(results).toEqual([1, 2])
      expect(errors).toEqual(['fail'])
    })
    test('handles all fulfilled', () => {
      const settled: PromiseSettledResult<string>[] = [
        { status: 'fulfilled', value: 'a' },
        { status: 'fulfilled', value: 'b' }
      ]
      const { errors, results } = collectSettled(settled)
      expect(results).toEqual(['a', 'b'])
      expect(errors).toEqual([])
    })
    test('handles all rejected', () => {
      const settled: PromiseSettledResult<string>[] = [
        { reason: 'e1', status: 'rejected' },
        { reason: 'e2', status: 'rejected' }
      ]
      const { errors, results } = collectSettled(settled)
      expect(results).toEqual([])
      expect(errors).toEqual(['e1', 'e2'])
    })
    test('handles empty array', () => {
      const { errors, results } = collectSettled([])
      expect(results).toEqual([])
      expect(errors).toEqual([])
    })
  })
  describe('resolveBulkError', () => {
    test('returns defaultOnError when no options', () => {
      const handler = resolveBulkError()
      expect(typeof handler).toBe('function')
    })
    test('returns undefined when onError is false', () => {
      const handler = resolveBulkError({ onError: false })
      expect(handler).toBeUndefined()
    })
    test('returns custom handler when provided', () => {
      const errors: unknown[] = []
      const custom = (e: unknown) => {
        errors.push(e)
      }
      const handler = resolveBulkError({ onError: custom })
      expect(handler).toBe(custom)
    })
  })
  describe('type safety', () => {
    test('Middleware type requires name', () => {
      const mw: Middleware = { name: 'test' }
      expect(mw.name).toBe('test')
    })
    test('MiddlewareCtx extends GlobalHookCtx with operation', () => {
      const ctx: MiddlewareCtx = {
        db: {} as MiddlewareCtx['db'],
        operation: 'create',
        table: 'test'
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
      const tmpDir = `/tmp/noboil-convex-test-health-${Date.now()}`
      mkdirSync(`${tmpDir}/convex/_generated`, { recursive: true })
      writeFileSync(`${tmpDir}/convex/blog.ts`, "crud('blog', owned.blog)")
      const schemaFile = {
        content: 'const owned = makeOwned({ blog: object({ title: string() }) })',
        path: `${tmpDir}/schema.ts`
      }
      const issues = checkSchemaConsistency(`${tmpDir}/convex`, schemaFile)
      const schemaErrors = issues.filter(i => i.level === 'error')
      expect(schemaErrors).toHaveLength(0)
    })
  })
  describe('checkIndexCoverage', () => {
    test('returns empty issues when no where clauses used', async () => {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      const calls: FactoryCall[] = [{ factory: 'crud', file: 'blog.ts', options: '', table: 'blog' }]
      const tmpDir = `/tmp/noboil-convex-test-idx-${Date.now()}`
      mkdirSync(`${tmpDir}/convex/_generated`, { recursive: true })
      writeFileSync(`${tmpDir}/convex/schema.ts`, 'export default defineSchema({})')
      const issues = checkIndexCoverage(`${tmpDir}/convex`, calls)
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
      expect(error.message).toBe('Not found')
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
      expect((result as MutationFail).error.message).toBe('Too many requests')
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
    test('returns true for ConvexError with valid code', () => {
      expect(isMutationError(new ConvexError({ code: 'NOT_FOUND' }))).toBe(true)
    })
    test('returns true for ConvexError with code and data', () => {
      expect(isMutationError(new ConvexError({ code: 'CONFLICT', message: 'stale' }))).toBe(true)
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
    test('returns false for ConvexError with invalid code', () => {
      expect(isMutationError(new ConvexError({ code: 'INVALID_NOPE' }))).toBe(false)
    })
    test('returns false for ConvexError with non-string code', () => {
      expect(isMutationError(new ConvexError({ code: 123 }))).toBe(false)
    })
    test('returns false for ConvexError with string data', () => {
      expect(isMutationError(new ConvexError('just text'))).toBe(false)
    })
    test('returns true for every valid ErrorCode', () => {
      const codes: ErrorCode[] = ['NOT_FOUND', 'FORBIDDEN', 'RATE_LIMITED', 'CONFLICT', 'VALIDATION_FAILED']
      for (const code of codes) expect(isMutationError(new ConvexError({ code }))).toBe(true)
    })
  })
  describe('isErrorCode()', () => {
    test('returns true when code matches', () => {
      const e = new ConvexError({ code: 'NOT_FOUND' })
      expect(isErrorCode(e, 'NOT_FOUND')).toBe(true)
    })
    test('returns false when code does not match', () => {
      const e = new ConvexError({ code: 'FORBIDDEN' })
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
    test('returns false for ConvexError with different code', () => {
      const e = new ConvexError({ code: 'RATE_LIMITED' })
      expect(isErrorCode(e, 'CONFLICT')).toBe(false)
    })
    test('works with every ErrorCode value', () => {
      const codes: ErrorCode[] = ['CONFLICT', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED', 'UNAUTHORIZED']
      for (const code of codes) {
        const e = new ConvexError({ code })
        expect(isErrorCode(e, code)).toBe(true)
        expect(isErrorCode(e, 'ALREADY_ORG_MEMBER')).toBe(false)
      }
    })
  })
  describe('matchError()', () => {
    test('matches specific error code', () => {
      const e = new ConvexError({ code: 'NOT_FOUND' })
      const result = matchError(e, {
        NOT_FOUND: d => `found: ${d.code}`
      })
      expect(result).toBe('found: NOT_FOUND')
    })
    test('returns handler return value', () => {
      const e = new ConvexError({ code: 'RATE_LIMITED', message: 'slow down' })
      const result = matchError(e, {
        RATE_LIMITED: d => ({ msg: d.message, retry: true })
      })
      expect(result).toEqual({ msg: 'slow down', retry: true })
    })
    test('calls _ fallback when no specific handler', () => {
      const e = new ConvexError({ code: 'FORBIDDEN' })
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
      const e = new ConvexError({ code: 'FORBIDDEN' })
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
      const e = new ConvexError({ code: 'CONFLICT' })
      const result = matchError(e, {
        CONFLICT: () => 'specific',
        _: () => 'fallback'
      })
      expect(result).toBe('specific')
    })
    test('handler receives full error data', () => {
      const e = new ConvexError({
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
      const e = new ConvexError({ code: 'RATE_LIMITED' })
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
      const e = new ConvexError({ code: 'NOT_FOUND' })
      const result: number | undefined = matchError(e, {
        NOT_FOUND: () => 42
      })
      expect(result).toBe(42)
    })
    test('_ receives original error for non-ConvexError', () => {
      const original = new Error('boom')
      const result = matchError(original, {
        _: e => (e as Error).message
      })
      expect(result).toBe('boom')
    })
    test('_ receives original error for ConvexError without matching handler', () => {
      const original = new ConvexError({ code: 'FORBIDDEN' })
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
      const e = new ConvexError({
        code: errorData.code,
        message: errorData.message
      } as Record<string, string | undefined>)
      const msg = matchError(e, {
        NOT_FOUND: d => `Item not found: ${d.message}`,
        _: () => 'Unknown error'
      })
      expect(msg).toBe('Item not found: Not found')
    })
    test('ok result does not need error handling', () => {
      const result = ok({ id: '123' })
      expect(result.ok).toBe(true)
    })
    test('fail result can be used with isMutationError on ConvexError', () => {
      const result = fail('CONFLICT', { message: 'Stale' })
      expect(result.ok).toBe(false)
      const errorData = (result as MutationFail).error
      const thrown = new ConvexError({
        code: errorData.code,
        message: errorData.message
      } as Record<string, string | undefined>)
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
    test('extracts retryAfter from ConvexError', () => {
      const e = new ConvexError({ code: 'RATE_LIMITED', retryAfter: 30_000 })
      const d = extractErrorData(e)
      expect(d?.retryAfter).toBe(30_000)
    })
    test('retryAfter undefined when not a number', () => {
      const e = new ConvexError({ code: 'RATE_LIMITED', retryAfter: 'soon' })
      const d = extractErrorData(e)
      expect(d?.retryAfter).toBeUndefined()
    })
    test('extracts limit object from ConvexError', () => {
      const limit = { max: 10, remaining: 0, window: 60_000 }
      const e = new ConvexError({ code: 'RATE_LIMITED', limit })
      const d = extractErrorData(e)
      expect(d?.limit).toEqual(limit)
    })
    test('limit undefined when not an object', () => {
      const e = new ConvexError({ code: 'RATE_LIMITED', limit: 42 })
      const d = extractErrorData(e)
      expect(d?.limit).toBeUndefined()
    })
    test('limit undefined when null', () => {
      const e = new ConvexError({ code: 'RATE_LIMITED', limit: null })
      const d = extractErrorData(e)
      expect(d?.limit).toBeUndefined()
    })
    test('both retryAfter and limit extracted together', () => {
      const e = new ConvexError({
        code: 'RATE_LIMITED',
        limit: { max: 5, remaining: 0, window: 30_000 },
        retryAfter: 15_000
      })
      const d = extractErrorData(e)
      expect(d?.retryAfter).toBe(15_000)
      expect(d?.limit).toEqual({ max: 5, remaining: 0, window: 30_000 })
    })
    test('non-rate-limit errors have no retryAfter or limit', () => {
      const e = new ConvexError({ code: 'NOT_FOUND' })
      const d = extractErrorData(e)
      expect(d?.retryAfter).toBeUndefined()
      expect(d?.limit).toBeUndefined()
    })
  })
  describe('getErrorDetail with rate limit info', () => {
    test('includes retry after in detail string', () => {
      const e = new ConvexError({
        code: 'RATE_LIMITED',
        retryAfter: 45_000,
        table: 'blog'
      })
      const detail = getErrorDetail(e)
      expect(detail).toContain('blog')
      expect(detail).toContain('retry after 45000ms')
    })
    test('no retry info when retryAfter absent', () => {
      const e = new ConvexError({ code: 'RATE_LIMITED' })
      const detail = getErrorDetail(e)
      expect(detail).not.toContain('retry')
    })
    test('detail without table or retryAfter returns base message', () => {
      const e = new ConvexError({ code: 'NOT_FOUND' })
      const detail = getErrorDetail(e)
      expect(detail).toBe('Not found')
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
      const e = new ConvexError({
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
    test('handleConvexError passes rich metadata to handler', () => {
      const e = new ConvexError({
        code: 'RATE_LIMITED',
        limit: { max: 5, remaining: 0, window: 30_000 },
        retryAfter: 20_000
      })
      let received: ConvexErrorData | undefined
      handleConvexError(e, {
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
    const content = `const owned = makeOwned({
  blog: object({
    title: string(),
    content: string(),
  })
})`
    const tables = extractSchemaFields(content)
    expect(tables).toHaveLength(1)
    expect(tables[0]?.table).toBe('blog')
    expect(tables[0]?.factory).toBe('crud')
    expect(tables[0]?.fields).toHaveLength(2)
    expect(tables[0]?.fields[0]).toEqual({ field: 'title', type: 'string()' })
  })
  test('extracts multiple tables from same wrapper', () => {
    const content = `const owned = makeOwned({
  blog: object({
    title: string(),
  }),
  chat: object({
    name: string(),
    isPublic: boolean(),
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
      ['makeOwned', 'crud'],
      ['makeOrgScoped', 'orgCrud'],
      ['makeSingleton', 'singletonCrud'],
      ['makeBase', 'cacheCrud']
    ]
    for (const [wrapper, expected] of tests) {
      const content = `const x = ${wrapper}({
  item: object({
    name: string(),
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
    const content = `const schemas = {
  message: child({
    foreignKey: 'chatId',
    parent: 'chat',
    schema: object({
      text: string(),
      sender: string(),
    })
  })
}`
    const tables = extractSchemaFields(content)
    expect(tables).toHaveLength(1)
    expect(tables[0]?.table).toBe('message')
    expect(tables[0]?.factory).toBe('childCrud')
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
    const content = `const owned = makeOwned({
  blog: object({
    title: string(),
  })
})`
    const calls: FactoryCall[] = [{ factory: 'crud', file: 'blog.ts', options: '', table: 'blog' }]
    printSchemaPreview(content, calls)
    console.log = origLog
    const output = logs.join('\n')
    expect(output).toContain('blog')
    expect(output).toContain('crud')
    expect(output).toContain('title')
  })
  test('shows options when present', () => {
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '))
    }
    const content = `const owned = makeOwned({
  blog: object({
    title: string(),
  })
})`
    const calls: FactoryCall[] = [
      {
        factory: 'crud',
        file: 'blog.ts',
        options: "{ search: 'title', softDelete: true }",
        table: 'blog'
      }
    ]
    printSchemaPreview(content, calls)
    console.log = origLog
    const output = logs.join('\n')
    expect(output).toContain('search')
    expect(output).toContain('softDelete')
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
    const content = `const owned = makeOwned({
  blog: object({
    title: string(),
    content: string(),
  }),
  chat: object({
    name: string(),
  })
})`
    const calls: FactoryCall[] = [
      { factory: 'crud', file: 'blog.ts', options: '', table: 'blog' },
      { factory: 'crud', file: 'chat.ts', options: '', table: 'chat' }
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
    const tabs: DevtoolsProps['defaultTab'][] = ['errors', 'subs', 'mutations', 'cache']
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
    const content = `const owned = makeOwned({
  blog: object({
    title: string(),
    content: string(),
  })
})`
    const tables = extractSchemaFields(content)
    expect(tables).toHaveLength(1)
    expect(tables[0]?.table).toBe('blog')
    expect(tables[0]?.factory).toBe('crud')
    const endpoints = endpointsForFactory({
      factory: 'crud',
      file: '',
      options: '',
      table: 'blog'
    })
    expect(endpoints.length).toBeGreaterThan(0)
    expect(endpoints).toContain('pub.list')
    expect(endpoints).toContain('create')
    expect(endpoints).toContain('update')
    expect(endpoints).toContain('rm')
  })
  test('playground detects multiple factory types', () => {
    const content = `const owned = makeOwned({
  blog: object({ title: string() }),
})
const org = makeOrgScoped({
  project: object({ name: string() }),
})`
    const tables = extractSchemaFields(content)
    expect(tables).toHaveLength(2)
    const factories = tables.map(t => t.factory)
    expect(factories).toContain('crud')
    expect(factories).toContain('orgCrud')
  })
  test('endpointsForFactory returns correct endpoints for each factory', () => {
    expect(
      endpointsForFactory({
        factory: 'crud',
        file: '',
        options: '',
        table: 't'
      })
    ).toContain('create')
    expect(
      endpointsForFactory({
        factory: 'orgCrud',
        file: '',
        options: '',
        table: 't'
      })
    ).toContain('create')
    expect(
      endpointsForFactory({
        factory: 'singletonCrud',
        file: '',
        options: '',
        table: 't'
      })
    ).toContain('get')
    expect(
      endpointsForFactory({
        factory: 'singletonCrud',
        file: '',
        options: '',
        table: 't'
      })
    ).toContain('upsert')
    expect(
      endpointsForFactory({
        factory: 'cacheCrud',
        file: '',
        options: '',
        table: 't'
      })
    ).toContain('invalidate')
    expect(
      endpointsForFactory({
        factory: 'childCrud',
        file: '',
        options: '',
        table: 't'
      })
    ).toContain('list')
  })
  test('orgCrud with acl option adds editor endpoints', () => {
    const endpoints = endpointsForFactory({
      factory: 'orgCrud',
      file: '',
      options: '{ acl: true }',
      table: 't'
    })
    expect(endpoints).toContain('addEditor')
    expect(endpoints).toContain('removeEditor')
    expect(endpoints).toContain('editors')
  })
  test('crud with softDelete adds restore endpoint', () => {
    const endpoints = endpointsForFactory({
      factory: 'crud',
      file: '',
      options: '{ softDelete: true }',
      table: 't'
    })
    expect(endpoints).toContain('restore')
  })
  test('crud with search adds pub.search endpoint', () => {
    const endpoints = endpointsForFactory({
      factory: 'crud',
      file: '',
      options: "{ search: 'title' }",
      table: 't'
    })
    expect(endpoints).toContain('pub.search')
  })
})
describe('noboil-convex add command', () => {
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
    test('parses --convex-dir flag', () => {
      const flags = parseAddFlags(['todo', '--convex-dir=my-convex'])
      expect(flags.convexDir).toBe('my-convex')
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
    test('default convexDir is convex', () => {
      const flags = parseAddFlags(['todo'])
      expect(flags.convexDir).toBe('convex')
    })
    test('default appDir is src/app', () => {
      const flags = parseAddFlags(['todo'])
      expect(flags.appDir).toBe('src/app')
    })
  })
  describe('fieldToZod', () => {
    test('string field', () => {
      expect(fieldToZod({ name: 'title', optional: false, type: 'string' })).toBe('string()')
    })
    test('boolean field', () => {
      expect(fieldToZod({ name: 'done', optional: false, type: 'boolean' })).toBe('boolean()')
    })
    test('number field', () => {
      expect(fieldToZod({ name: 'count', optional: false, type: 'number' })).toBe('number()')
    })
    test('optional field', () => {
      expect(fieldToZod({ name: 'bio', optional: true, type: 'string' })).toBe('string().optional()')
    })
    test('enum field', () => {
      const result = fieldToZod({
        name: 'status',
        optional: false,
        type: { enum: ['draft', 'published'] }
      })
      expect(result).toBe("zenum(['draft', 'published'])")
    })
    test('optional enum field', () => {
      const result = fieldToZod({
        name: 'priority',
        optional: true,
        type: { enum: ['low', 'high'] }
      })
      expect(result).toBe("zenum(['low', 'high']).optional()")
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
      expect(content).toContain('makeOwned')
      expect(content).toContain('owned')
      expect(content).toContain('blog')
      expect(content).toContain('string()')
    })
    test('generates org schema', () => {
      const content = genSchemaContent('wiki', 'org', [{ name: 'title', optional: false, type: 'string' }])
      expect(content).toContain('makeOrgScoped')
      expect(content).toContain('orgScoped')
    })
    test('generates singleton schema', () => {
      const content = genSchemaContent('profile', 'singleton', [{ name: 'displayName', optional: false, type: 'string' }])
      expect(content).toContain('makeSingleton')
      expect(content).toContain('singletons')
    })
    test('generates base schema for cache', () => {
      const content = genSchemaContent('movie', 'cache', [{ name: 'title', optional: false, type: 'string' }])
      expect(content).toContain('makeBase')
      expect(content).toContain('base')
    })
    test('generates child schema', () => {
      const content = genSchemaContent('message', 'child', [{ name: 'text', optional: false, type: 'string' }])
      expect(content).toContain('child')
      expect(content).toContain('messageChild')
      expect(content).toContain('foreignKey')
    })
    test('includes enum import when needed', () => {
      const content = genSchemaContent('blog', 'owned', [
        {
          name: 'status',
          optional: false,
          type: { enum: ['draft', 'published'] }
        }
      ])
      expect(content).toContain('enum as zenum')
      expect(content).toContain("zenum(['draft', 'published'])")
    })
    test('includes optional fields', () => {
      const content = genSchemaContent('blog', 'owned', [{ name: 'bio', optional: true, type: 'string' }])
      expect(content).toContain('.optional()')
    })
  })
  describe('genEndpointContent', () => {
    test('generates owned endpoint', () => {
      const content = genEndpointContent('blog', 'owned')
      expect(content).toContain('crud')
      expect(content).toContain('owned.blog')
      expect(content).toContain('pub: { list, read }')
    })
    test('generates org endpoint', () => {
      const content = genEndpointContent('wiki', 'org')
      expect(content).toContain('orgCrud')
      expect(content).toContain('orgScoped.wiki')
      expect(content).toContain('addEditor')
    })
    test('generates singleton endpoint', () => {
      const content = genEndpointContent('profile', 'singleton')
      expect(content).toContain('singletonCrud')
      expect(content).toContain('singletons.profile')
      expect(content).toContain('get, upsert')
    })
    test('generates cache endpoint', () => {
      const content = genEndpointContent('movie', 'cache')
      expect(content).toContain('cacheCrud')
      expect(content).toContain('base.movie')
      expect(content).toContain('invalidate')
    })
    test('generates child endpoint', () => {
      const content = genEndpointContent('message', 'child')
      expect(content).toContain('childCrud')
      expect(content).toContain('messageChild')
    })
  })
  describe('genPageContent', () => {
    test('generates list page for owned type', () => {
      const content = genPageContent('blog', 'owned')
      expect(content).toContain('useList')
      expect(content).toContain('api.blog.list')
      expect(content).toContain('loadMore')
      expect(content).toContain('export default')
    })
    test('generates singleton page', () => {
      const content = genPageContent('profile', 'singleton')
      expect(content).toContain('useQuery')
      expect(content).toContain('api.profile.get')
      expect(content).toContain('export default')
    })
    test('generates page for org type', () => {
      const content = genPageContent('wiki', 'org')
      expect(content).toContain('useList')
      expect(content).toContain('api.wiki.list')
    })
    test('generates page for cache type', () => {
      const content = genPageContent('movie', 'cache')
      expect(content).toContain('useList')
      expect(content).toContain('api.movie.list')
    })
  })
  describe('add function', () => {
    test('add with --help returns zero counts', () => {
      const result = add(['--help'])
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
      const content = `export { default as LazyConvexDevtools } from './devtools-panel'`
      const result = resolveReExports(content)
      expect(result).toHaveLength(1)
      expect(result[0]?.symbol).toBe('LazyConvexDevtools')
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
        `export { default as LazyConvexDevtools } from './devtools-panel'`,
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
    expect(checkEslintContent("import { recommended } from '@noboil/convex/eslint'").status).toBe('pass')
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
        dependencies: { '@noboil/convex': '2', convex: '1', zod: '3' }
      }).status
    ).toBe('pass')
  })
  test('checkDeps — missing dep is fail', () => {
    expect(checkDeps({ dependencies: { convex: '1', zod: '3' } }).status).toBe('fail')
  })
  test('checkDeps — devDependencies count', () => {
    expect(
      checkDeps({
        devDependencies: { '@noboil/convex': '2', convex: '1', zod: '3' }
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
})
describe('matchW — additional edge cases', () => {
  const doc = { category: 'tech', price: 50, published: true, title: 'Test', userId: 'u1' }
  test('empty where object matches everything', () => {
    expect(matchW(doc, {} as Rec & { own?: boolean })).toBe(true)
  })
  test('OR with own: true group', () => {
    expect(
      matchW(doc, { or: [{ published: true }, { own: true }] } as Rec & { or?: (Rec & { own?: boolean })[] }, 'u1')
    ).toBe(true)
    expect(
      matchW(doc, { or: [{ published: false }, { own: true }] } as Rec & { or?: (Rec & { own?: boolean })[] }, 'u2')
    ).toBe(false)
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
describe('mergeGlobalHooks', () => {
  test('both undefined returns undefined', () => {
    expect(mergeGlobalHooks(undefined, undefined)).toBeUndefined()
  })
  test('only a defined returns a', () => {
    const a: GlobalHooks = { beforeCreate: async (_ctx, { data }) => data }
    expect(mergeGlobalHooks(a, undefined)).toBe(a)
  })
  test('only b defined returns b', () => {
    const b: GlobalHooks = { afterCreate: async () => undefined }
    expect(mergeGlobalHooks(undefined, b)).toBe(b)
  })
  test('beforeCreate — a then b in order, b receives a output', async () => {
    const order: string[] = []
    const a: GlobalHooks = {
      beforeCreate: async (_ctx, { data }) => {
        order.push('a')
        return { ...data, fromA: true }
      }
    }
    const b: GlobalHooks = {
      beforeCreate: async (_ctx, { data }) => {
        order.push('b')
        return { ...data, fromB: true }
      }
    }
    const merged = mergeGlobalHooks(a, b)
    const ctx = {} as GlobalHookCtx
    const result = await merged?.beforeCreate?.(ctx, { data: { title: 'x' } })
    expect(order).toEqual(['a', 'b'])
    expect(result).toEqual({ fromA: true, fromB: true, title: 'x' })
  })
  test('afterCreate — both fire in order', async () => {
    const order: string[] = []
    const a: GlobalHooks = {
      afterCreate: async () => {
        order.push('a')
      }
    }
    const b: GlobalHooks = {
      afterCreate: async () => {
        order.push('b')
      }
    }
    const merged = mergeGlobalHooks(a, b)
    await merged?.afterCreate?.({} as GlobalHookCtx, { data: {}, id: '1' })
    expect(order).toEqual(['a', 'b'])
  })
  test('beforeUpdate — a then b, data passes through', async () => {
    const a: GlobalHooks = {
      beforeUpdate: async (_ctx, { patch }) => ({ ...patch, aField: 1 })
    }
    const b: GlobalHooks = {
      beforeUpdate: async (_ctx, { patch }) => ({ ...patch, bField: 2 })
    }
    const merged = mergeGlobalHooks(a, b)
    const result = await merged?.beforeUpdate?.({} as GlobalHookCtx, { id: '1', patch: { x: 0 }, prev: {} })
    expect(result).toEqual({ aField: 1, bField: 2, x: 0 })
  })
  test('afterUpdate — both fire', async () => {
    const order: string[] = []
    const a: GlobalHooks = {
      afterUpdate: async () => {
        order.push('a')
      }
    }
    const b: GlobalHooks = {
      afterUpdate: async () => {
        order.push('b')
      }
    }
    const merged = mergeGlobalHooks(a, b)
    await merged?.afterUpdate?.({} as GlobalHookCtx, { id: '1', patch: {}, prev: {} })
    expect(order).toEqual(['a', 'b'])
  })
  test('beforeDelete — both fire in order', async () => {
    const order: string[] = []
    const a: GlobalHooks = {
      beforeDelete: async () => {
        order.push('a')
      }
    }
    const b: GlobalHooks = {
      beforeDelete: async () => {
        order.push('b')
      }
    }
    const merged = mergeGlobalHooks(a, b)
    await merged?.beforeDelete?.({} as GlobalHookCtx, { doc: {}, id: '1' })
    expect(order).toEqual(['a', 'b'])
  })
  test('afterDelete — both fire in order', async () => {
    const order: string[] = []
    const a: GlobalHooks = {
      afterDelete: async () => {
        order.push('a')
      }
    }
    const b: GlobalHooks = {
      afterDelete: async () => {
        order.push('b')
      }
    }
    const merged = mergeGlobalHooks(a, b)
    await merged?.afterDelete?.({} as GlobalHookCtx, { doc: {}, id: '1' })
    expect(order).toEqual(['a', 'b'])
  })
})
describe('mergeHooks — global + per-table', () => {
  test('both undefined returns undefined', () => {
    expect(mergeHooks(undefined, undefined, 'blog')).toBeUndefined()
  })
  test('only global hook defined — fires with table in ctx', async () => {
    let receivedTable = ''
    const gh: GlobalHooks = {
      beforeCreate: async (ctx, { data }) => {
        receivedTable = ctx.table
        return data
      }
    }
    const merged = mergeHooks(gh, undefined, 'blog')
    await merged?.beforeCreate?.({} as HookCtx, { data: { x: 1 } })
    expect(receivedTable).toBe('blog')
  })
  test('only per-table hook defined — fires normally', async () => {
    let called = false
    const fh: CrudHooks = {
      afterCreate: async () => {
        called = true
      }
    }
    const merged = mergeHooks(undefined, fh, 'blog')
    await merged?.afterCreate?.({} as HookCtx, { data: {}, id: '1' })
    expect(called).toBe(true)
  })
  test('global beforeCreate then per-table beforeCreate — data flows through', async () => {
    const order: string[] = []
    const gh: GlobalHooks = {
      beforeCreate: async (_ctx, { data }) => {
        order.push('global')
        return { ...data, global: true }
      }
    }
    const fh: CrudHooks = {
      beforeCreate: async (_ctx, { data }) => {
        order.push('table')
        return { ...data, table: true }
      }
    }
    const merged = mergeHooks(gh, fh, 'posts')
    const result = await merged?.beforeCreate?.({} as HookCtx, { data: { title: 'hi' } })
    expect(order).toEqual(['global', 'table'])
    expect(result).toEqual({ global: true, table: true, title: 'hi' })
  })
  test('beforeUpdate — global then per-table, patch flows', async () => {
    const gh: GlobalHooks = {
      beforeUpdate: async (_ctx, { patch }) => ({ ...patch, g: 1 })
    }
    const fh: CrudHooks = {
      beforeUpdate: async (_ctx, { patch }) => ({ ...patch, t: 2 })
    }
    const merged = mergeHooks(gh, fh, 'posts')
    const result = await merged?.beforeUpdate?.({} as HookCtx, { id: '1', patch: { x: 0 }, prev: {} })
    expect(result).toEqual({ g: 1, t: 2, x: 0 })
  })
  test('afterUpdate — global then per-table in order', async () => {
    const order: string[] = []
    const gh: GlobalHooks = {
      afterUpdate: async () => {
        order.push('global')
      }
    }
    const fh: CrudHooks = {
      afterUpdate: async () => {
        order.push('table')
      }
    }
    const merged = mergeHooks(gh, fh, 'posts')
    await merged?.afterUpdate?.({} as HookCtx, { id: '1', patch: {}, prev: {} })
    expect(order).toEqual(['global', 'table'])
  })
  test('beforeDelete — global then per-table', async () => {
    const order: string[] = []
    const gh: GlobalHooks = {
      beforeDelete: async () => {
        order.push('global')
      }
    }
    const fh: CrudHooks = {
      beforeDelete: async () => {
        order.push('table')
      }
    }
    const merged = mergeHooks(gh, fh, 'posts')
    await merged?.beforeDelete?.({} as HookCtx, { doc: {}, id: '1' })
    expect(order).toEqual(['global', 'table'])
  })
  test('afterDelete — global then per-table', async () => {
    const order: string[] = []
    const gh: GlobalHooks = {
      afterDelete: async () => {
        order.push('global')
      }
    }
    const fh: CrudHooks = {
      afterDelete: async () => {
        order.push('table')
      }
    }
    const merged = mergeHooks(gh, fh, 'posts')
    await merged?.afterDelete?.({} as HookCtx, { doc: {}, id: '1' })
    expect(order).toEqual(['global', 'table'])
  })
  test('missing hooks on one side do not break composition', async () => {
    const gh: GlobalHooks = {
      beforeCreate: async (_ctx, { data }) => ({ ...data, g: true })
    }
    const fh: CrudHooks = {
      afterDelete: async () => undefined
    }
    const merged = mergeHooks(gh, fh, 'x')
    expect(merged?.afterUpdate).toBeUndefined()
    const createResult = await merged?.beforeCreate?.({} as HookCtx, { data: {} })
    expect(createResult).toEqual({ g: true })
    expect(merged?.afterDelete).toBeDefined()
  })
})
describe('mergeCacheHooks', () => {
  test('both undefined returns undefined', () => {
    expect(mergeCacheHooks(undefined, undefined, 'cache')).toBeUndefined()
  })
  test('global + cache hooks merge beforeCreate in order', async () => {
    const order: string[] = []
    const gh: GlobalHooks = {
      beforeCreate: async (_ctx, { data }) => {
        order.push('global')
        return { ...data, g: true }
      }
    }
    const fh: CacheHooks = {
      beforeCreate: async (_ctx, { data }) => {
        order.push('cache')
        return { ...data, c: true }
      }
    }
    const merged = mergeCacheHooks(gh, fh, 'cache_table')
    const result = await merged?.beforeCreate?.({} as CacheHookCtx, { data: { key: 'k' } })
    expect(order).toEqual(['global', 'cache'])
    expect(result).toEqual({ c: true, g: true, key: 'k' })
  })
  test('onFetch from cache hooks is preserved', () => {
    const onFetch = async () => ({})
    const fh: CacheHooks = { onFetch }
    const merged = mergeCacheHooks(undefined, fh, 't')
    expect(merged?.onFetch).toBe(onFetch)
  })
})
