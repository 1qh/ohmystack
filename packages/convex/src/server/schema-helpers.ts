import type { ZodObject, ZodRawShape } from 'zod/v4'

import { zodOutputToConvexFields as z2c } from 'convex-helpers/server/zod4'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import type { BaseSchema, OrgSchema, OwnedSchema, SingletonSchema } from './types'

import { elementOf, isArrayType, unwrapZod } from '../zod'
import { indexFields } from './bridge'
import { isRecord } from './helpers'

/**
 * Creates a Convex table definition from a base schema with an optional updatedAt field.
 * @param s - Base-branded Zod schema
 * @returns Convex table definition
 */
const baseTable = <T extends ZodRawShape>(s: BaseSchema<T>) =>
    defineTable({ ...z2c(s.shape), updatedAt: v.optional(v.number()) }),
  /**
   * Creates a Convex table definition for user-owned data with userId index.
   * @param s - Owned-branded Zod schema
   * @returns Convex table definition with by_user index
   */
  ownedTable = <T extends ZodRawShape>(s: OwnedSchema<T>) =>
    defineTable({ ...z2c(s.shape), updatedAt: v.number(), userId: v.id('users') }).index('by_user', indexFields('userId')),
  /**
   * Creates a Convex table definition for singleton per-user data with userId index.
   * @param s - Singleton-branded Zod schema
   * @returns Convex table definition with by_user index
   */
  singletonTable = <T extends ZodRawShape>(s: SingletonSchema<T>) =>
    defineTable({ ...z2c(s.shape), updatedAt: v.number(), userId: v.id('users') }).index('by_user', indexFields('userId')),
  /**
   * Creates a Convex table definition for org-scoped data with orgId and orgId+userId indexes.
   * @param s - Org-branded Zod schema
   * @returns Convex table definition with by_org and by_org_user indexes
   */
  orgTable = <T extends ZodRawShape>(s: OrgSchema<T>) =>
    defineTable({
      ...z2c(s.shape),
      orgId: v.id('org'),
      updatedAt: v.number(),
      userId: v.id('users')
    })
      .index('by_org', indexFields('orgId'))
      .index('by_org_user', indexFields('orgId', 'userId')),
  /**
   * Creates a Convex table definition for org-scoped child data with orgId and parent foreign key indexes.
   * @param s - Org-branded Zod schema
   * @param parent - Object with foreignKey and table name for the parent relationship
   * @returns Convex table definition with by_org and by_parent indexes
   */
  orgChildTable = <T extends ZodRawShape>(
    s: OrgSchema<T>,
    parent: {
      foreignKey: string
      table: string
    }
  ) =>
    defineTable({
      ...z2c(s.shape),
      orgId: v.id('org'),
      updatedAt: v.number(),
      userId: v.id('users')
    })
      .index('by_org', indexFields('orgId'))
      .index('by_parent', indexFields(parent.foreignKey)),
  /**
   * Creates a Convex table definition for child data indexed by a foreign key.
   * @param s - Zod schema for the child table
   * @param indexField - Field name to index on
   * @param indexName - Optional custom index name (defaults to `by_{indexField}`)
   * @returns Convex table definition with the specified index
   */
  childTable = <T extends ZodRawShape>(s: ZodObject<T>, indexField: string, indexName?: string) =>
    defineTable({
      ...z2c(s.shape),
      updatedAt: v.number()
    }).index(indexName ?? `by_${indexField}`, indexFields(indexField)),
  /**
   * Returns the full set of Convex table definitions for org infrastructure: org, orgInvite, orgJoinRequest, orgMember.
   * @returns Object with org, orgInvite, orgJoinRequest, and orgMember table definitions
   */
  orgTables = () => ({
    org: defineTable({
      avatarId: v.optional(v.id('_storage')),
      name: v.string(),
      slug: v.string(),
      updatedAt: v.number(),
      userId: v.id('users')
    })
      .index('by_slug', ['slug'])
      .index('by_user', ['userId']),
    orgInvite: defineTable({
      email: v.string(),
      expiresAt: v.number(),
      isAdmin: v.boolean(),
      orgId: v.id('org'),
      token: v.string()
    })
      .index('by_org', ['orgId'])
      .index('by_token', ['token']),
    orgJoinRequest: defineTable({
      message: v.optional(v.string()),
      orgId: v.id('org'),
      status: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
      userId: v.id('users')
    })
      .index('by_org', ['orgId'])
      .index('by_org_status', ['orgId', 'status'])
      .index('by_user', ['userId']),
    orgMember: defineTable({
      isAdmin: v.boolean(),
      orgId: v.id('org'),
      updatedAt: v.number(),
      userId: v.id('users')
    })
      .index('by_org', ['orgId'])
      .index('by_org_user', ['orgId', 'userId'])
      .index('by_user', ['userId'])
  }),
  /**
   * Returns a Convex table definition for the rate limiting table with a composite table+key index.
   * @returns Object with a rateLimit table definition
   */
  rateLimitTable = () => ({
    rateLimit: defineTable({
      count: v.number(),
      key: v.string(),
      table: v.string(),
      windowStart: v.number()
    }).index('by_table_key', ['table', 'key'])
  }),
  /**
   * Returns Convex table definitions for chunked file upload infrastructure: uploadChunk, uploadRateLimit, uploadSession.
   * @returns Object with uploadChunk, uploadRateLimit, and uploadSession table definitions
   */
  uploadTables = () => ({
    uploadChunk: defineTable({
      chunkIndex: v.number(),
      storageId: v.id('_storage'),
      totalChunks: v.number(),
      uploadId: v.string(),
      userId: v.id('users')
    })
      .index('by_upload', ['uploadId'])
      .index('by_user', ['userId']),
    uploadRateLimit: defineTable({
      count: v.number(),
      userId: v.id('users'),
      windowStart: v.number()
    }).index('by_user', ['userId']),
    uploadSession: defineTable({
      completedChunks: v.number(),
      contentType: v.string(),
      fileName: v.string(),
      finalStorageId: v.optional(v.id('_storage')),
      status: v.union(v.literal('pending'), v.literal('assembling'), v.literal('completed'), v.literal('failed')),
      totalChunks: v.number(),
      totalSize: v.number(),
      uploadId: v.string(),
      userId: v.id('users')
    })
      .index('by_upload_id', ['uploadId'])
      .index('by_user', ['userId'])
  })

interface CheckSchemaOutput {
  path: string
  zodType: string
}

const unsupportedTypes = new Set(['pipe', 'transform']),
  scanSchema = (schema: unknown, path: string, out: CheckSchemaOutput[]) => {
    const b = unwrapZod(schema)
    if (b.type && unsupportedTypes.has(b.type)) out.push({ path, zodType: b.type })
    if (isArrayType(b.type)) return scanSchema(elementOf(b.schema), `${path}[]`, out)
    if (b.type === 'object' && b.schema && isRecord((b.schema as unknown as { shape?: unknown }).shape))
      for (const [k, vl] of Object.entries((b.schema as unknown as { shape: Record<string, unknown> }).shape))
        scanSchema(vl, path ? `${path}.${k}` : k, out)
  },
  /**
   * Scans Zod schemas for unsupported types (pipe, transform) and exits with error if found.
   * @param schemas - Map of table names to Zod schemas to validate
   */
  checkSchema = (schemas: Record<string, ZodObject<ZodRawShape>>) => {
    const res: CheckSchemaOutput[] = []
    for (const [table, schema] of Object.entries(schemas)) scanSchema(schema, table, res)
    if (res.length > 0) {
      for (const f of res) process.stderr.write(`${f.path}: unsupported zod type "${f.zodType}"\n`)
      process.exitCode = 1
    }
  }

export {
  baseTable,
  checkSchema,
  childTable,
  orgChildTable,
  orgTable,
  orgTables,
  ownedTable,
  rateLimitTable,
  singletonTable,
  uploadTables
}
