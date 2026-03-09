import type { ActionBuilder, GenericDataModel, MutationBuilder, QueryBuilder } from 'convex/server'

import { anyApi } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import type { DbLike, ErrorCode, FilterLike, Rec } from './types'

import { BYTES_PER_MB } from '../constants'
import { idx } from './bridge'
import { isTestMode } from './env'
import { log } from './helpers'

interface FileActionCtx {
  runMutation: (...a: unknown[]) => Promise<unknown>
  runQuery: (...a: unknown[]) => Promise<unknown>
  storage: FileStor
}

interface FileCtx {
  db: DbLike
  storage: FileStor
}
interface FileStor {
  delete: (id: string) => Promise<void>
  generateUploadUrl: () => Promise<string>
  get: (id: string) => Promise<Blob | null>
  getUrl: (id: string) => Promise<null | string>
  store: (blob: Blob) => Promise<string>
}

interface FileUploadConfig<DM extends GenericDataModel = GenericDataModel> {
  action: ActionBuilder<DM, 'public'>
  allowedTypes?: Set<string>
  getAuthUserId: (ctx: unknown) => Promise<null | string>
  internalMutation: MutationBuilder<DM, 'internal'>
  internalQuery: QueryBuilder<DM, 'internal'>
  maxFileSize?: number
  mutation: MutationBuilder<DM, 'public'>
  namespace: string
  query: QueryBuilder<DM, 'public'>
}

const DEFAULT_ALLOWED_TYPES = new Set([
    'application/json',
    'application/msword',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/svg+xml',
    'image/webp',
    'text/csv',
    'text/plain'
  ]),
  DEFAULT_MAX_FILE_SIZE = 10 * BYTES_PER_MB,
  CHUNK_SIZE = 5 * BYTES_PER_MB,
  RATE_LIMIT_WINDOW = 60 * 1000,
  MAX_UPLOADS_PER_WINDOW = 10,
  cvErr = (code: ErrorCode, message?: string) => new ConvexError(message ? { code, message } : { code }),
  /**
   * Creates a complete file upload system with single-file upload, validation, chunked upload, and progress tracking.
   * @param config - Upload configuration including builders, auth, allowed types, max size, and namespace
   * @returns Object with upload, validate, info, chunked upload endpoints, and CHUNK_SIZE constant
   */
  makeFileUpload = <DM extends GenericDataModel>(config: FileUploadConfig<DM>) => {
    const {
        action,
        allowedTypes = DEFAULT_ALLOWED_TYPES,
        getAuthUserId,
        internalMutation,
        internalQuery,
        maxFileSize = DEFAULT_MAX_FILE_SIZE,
        mutation,
        namespace,
        query
      } = config,
      tPath = (anyApi as Rec)[namespace] as Rec,
      authUserId = async (ctx: unknown) => getAuthUserId(ctx),
      validateFileType = async (
        storage: { delete: (id: string) => Promise<void> },
        id: string,
        contentType: string | undefined
      ) => {
        if (!allowedTypes.has(contentType ?? '')) {
          await storage.delete(id)
          throw cvErr('INVALID_FILE_TYPE', `File type ${contentType} not allowed`)
        }
      },
      validateFileSize = async (storage: { delete: (id: string) => Promise<void> }, id: string, size: number) => {
        if (size > maxFileSize) {
          await storage.delete(id)
          throw cvErr('FILE_TOO_LARGE', `File size ${size} exceeds ${maxFileSize} bytes`)
        }
      },
      checkRateLimit = async (db: DbLike, userId: string) => {
        const now = Date.now(),
          existing = await Promise.resolve(
            db
              .query('uploadRateLimit')
              .withIndex(
                'by_user',
                idx(q => q.eq('userId', userId))
              )
              .first()
          )
        if (!existing) {
          await db.insert('uploadRateLimit', { count: 1, userId, windowStart: now })
          return
        }
        const windowExpired = now - (existing.windowStart as number) >= RATE_LIMIT_WINDOW
        if (windowExpired) {
          await db.patch(existing._id as string, { count: 1, windowStart: now })
          return
        }
        if ((existing.count as number) >= MAX_UPLOADS_PER_WINDOW) throw cvErr('RATE_LIMITED')
        await db.patch(existing._id as string, { count: (existing.count as number) + 1 })
      },
      upload = mutation({
        handler: async (c: FileCtx) => {
          const userId = await authUserId(c)
          if (!userId) throw cvErr('NOT_AUTHENTICATED')
          if (!isTestMode()) await checkRateLimit(c.db, userId)
          return c.storage.generateUploadUrl()
        }
      } as never),
      validate = mutation({
        args: { id: v.id('_storage') },
        handler: async (c: FileCtx, { id }: { id: string }) => {
          const userId = await authUserId(c)
          if (!userId) throw cvErr('NOT_AUTHENTICATED')
          const meta = await c.db.system.get(id)
          if (!meta) throw cvErr('FILE_NOT_FOUND')
          await validateFileType(c.storage, id, meta.contentType as string)
          await validateFileSize(c.storage, id, meta.size as number)
          return { contentType: meta.contentType, size: meta.size, valid: true }
        }
      } as never),
      info = query({
        args: { id: v.id('_storage') },
        handler: async (c: FileCtx, { id }: { id: string }) => {
          const userId = await authUserId(c)
          if (!userId) throw cvErr('NOT_AUTHENTICATED')
          const [meta, url] = await Promise.all([c.db.system.get(id), c.storage.getUrl(id)])
          return meta ? { ...meta, url } : null
        }
      } as never),
      startChunkedUpload = mutation({
        args: {
          contentType: v.string(),
          fileName: v.string(),
          totalChunks: v.number(),
          totalSize: v.number()
        },
        handler: async (
          c: FileCtx,
          {
            contentType,
            fileName,
            totalChunks,
            totalSize
          }: { contentType: string; fileName: string; totalChunks: number; totalSize: number }
        ) => {
          const userId = await authUserId(c)
          if (!userId) throw cvErr('NOT_AUTHENTICATED')
          if (!isTestMode()) await checkRateLimit(c.db, userId)
          if (!allowedTypes.has(contentType)) throw cvErr('INVALID_FILE_TYPE', `File type ${contentType} not allowed`)
          if (totalSize > maxFileSize) throw cvErr('FILE_TOO_LARGE', `File size ${totalSize} exceeds ${maxFileSize} bytes`)
          const uploadId = `${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`
          await c.db.insert('uploadSession', {
            completedChunks: 0,
            contentType,
            fileName,
            status: 'pending',
            totalChunks,
            totalSize,
            uploadId,
            userId
          })
          return { uploadId }
        }
      } as never),
      uploadChunk = mutation({
        args: {
          chunkIndex: v.number(),
          uploadId: v.string()
        },
        handler: async (c: FileCtx, { chunkIndex, uploadId }: { chunkIndex: number; uploadId: string }) => {
          const userId = await authUserId(c)
          if (!userId) throw cvErr('NOT_AUTHENTICATED')
          const session = await c.db
            .query('uploadSession')
            .withIndex(
              'by_upload_id',
              idx(q => q.eq('uploadId', uploadId))
            )
            .unique()
          if (!session) throw cvErr('SESSION_NOT_FOUND')
          if (session.userId !== userId) throw cvErr('UNAUTHORIZED')
          if (session.status !== 'pending') throw cvErr('INVALID_SESSION_STATE')
          const existing = await c.db
            .query('uploadChunk')
            .withIndex(
              'by_upload',
              idx(q => q.eq('uploadId', uploadId))
            )
            .filter((q: FilterLike) => q.eq(q.field('chunkIndex'), chunkIndex))
            .unique()
          if (existing) throw cvErr('CHUNK_ALREADY_UPLOADED')
          return c.storage.generateUploadUrl()
        }
      } as never),
      confirmChunk = mutation({
        args: {
          chunkIndex: v.number(),
          storageId: v.id('_storage'),
          uploadId: v.string()
        },
        handler: async (
          c: FileCtx,
          { chunkIndex, storageId, uploadId }: { chunkIndex: number; storageId: string; uploadId: string }
        ) => {
          const userId = await authUserId(c)
          if (!userId) throw cvErr('NOT_AUTHENTICATED')
          const session = await c.db
            .query('uploadSession')
            .withIndex(
              'by_upload_id',
              idx(q => q.eq('uploadId', uploadId))
            )
            .unique()
          if (!session) throw cvErr('SESSION_NOT_FOUND')
          if (session.userId !== userId) throw cvErr('UNAUTHORIZED')
          await c.db.insert('uploadChunk', {
            chunkIndex,
            storageId,
            totalChunks: session.totalChunks,
            uploadId,
            userId
          })
          const chunks = await c.db
            .query('uploadChunk')
            .withIndex(
              'by_upload',
              idx(q => q.eq('uploadId', uploadId))
            )
            .collect()
          await c.db.patch(session._id as string, {
            completedChunks: chunks.length
          })
          const allUploaded = chunks.length === session.totalChunks
          return {
            allUploaded,
            completedChunks: chunks.length,
            totalChunks: session.totalChunks
          }
        }
      } as never),
      getSessionForAssembly = internalQuery({
        args: { uploadId: v.string() },
        handler: async (c: { db: DbLike }, { uploadId }: { uploadId: string }) => {
          const session = await c.db
            .query('uploadSession')
            .withIndex(
              'by_upload_id',
              idx(q => q.eq('uploadId', uploadId))
            )
            .unique()
          if (!session) return null
          const chunks = await c.db
            .query('uploadChunk')
            .withIndex(
              'by_upload',
              idx(q => q.eq('uploadId', uploadId))
            )
            .collect()
          if (chunks.length !== session.totalChunks) throw cvErr('INCOMPLETE_UPLOAD')
          return { ...session, chunks }
        }
      } as never),
      finalizeAssembly = internalMutation({
        args: {
          chunkStorageIds: v.array(v.id('_storage')),
          finalStorageId: v.id('_storage'),
          uploadId: v.string()
        },
        handler: async (
          c: FileCtx,
          {
            chunkStorageIds,
            finalStorageId,
            uploadId
          }: { chunkStorageIds: string[]; finalStorageId: string; uploadId: string }
        ) => {
          const session = await c.db
            .query('uploadSession')
            .withIndex(
              'by_upload_id',
              idx(q => q.eq('uploadId', uploadId))
            )
            .unique()
          if (!session) throw cvErr('SESSION_NOT_FOUND')
          await c.db.patch(session._id as string, { finalStorageId, status: 'completed' })
          const chunks = await c.db
              .query('uploadChunk')
              .withIndex(
                'by_upload',
                idx(q => q.eq('uploadId', uploadId))
              )
              .collect(),
            sr = await Promise.allSettled(chunkStorageIds.map(async (id: string) => c.storage.delete(id)))
          for (const r of sr)
            if (r.status === 'rejected') log('warn', 'file:chunk_cleanup_failed', { reason: String(r.reason) })
          await Promise.all(chunks.map(async (chunk: Rec) => c.db.delete(chunk._id as string)))
        }
      } as never),
      assembleChunks = action({
        args: { uploadId: v.string() },
        handler: async (
          c: FileActionCtx,
          { uploadId }: { uploadId: string }
        ): Promise<{ contentType: string; size: number; storageId: string }> => {
          const session = (await c.runQuery(tPath.getSessionForAssembly, { uploadId })) as null | Rec
          if (!session) throw cvErr('SESSION_NOT_FOUND')
          if (session.status !== 'pending') throw cvErr('INVALID_SESSION_STATE')
          const sortedChunks = (session.chunks as Rec[]).toSorted(
              (a: Rec, b: Rec) => (a.chunkIndex as number) - (b.chunkIndex as number)
            ),
            chunkBlobs = await Promise.all(
              sortedChunks.map(async (chunk: Rec) => {
                const blob = await c.storage.get(chunk.storageId as string)
                if (!blob) throw cvErr('CHUNK_NOT_FOUND')
                return blob
              })
            ),
            combinedBlob = new Blob(chunkBlobs, { type: session.contentType as string }),
            finalStorageId = await c.storage.store(combinedBlob)
          await c.runMutation(tPath.finalizeAssembly, {
            chunkStorageIds: sortedChunks.map((ch: Rec) => ch.storageId),
            finalStorageId,
            uploadId
          })
          return {
            contentType: session.contentType as string,
            size: session.totalSize as number,
            storageId: finalStorageId
          }
        }
      } as never),
      cancelChunkedUpload = mutation({
        args: { uploadId: v.string() },

        handler: async (c: FileCtx, { uploadId }: { uploadId: string }) => {
          const userId = await authUserId(c)
          if (!userId) throw cvErr('NOT_AUTHENTICATED')
          const session = await c.db
            .query('uploadSession')
            .withIndex(
              'by_upload_id',
              idx(q => q.eq('uploadId', uploadId))
            )
            .unique()
          if (!session) throw cvErr('SESSION_NOT_FOUND')
          if (session.userId !== userId) throw cvErr('UNAUTHORIZED')
          const chunks = await c.db
              .query('uploadChunk')
              .withIndex(
                'by_upload',
                idx(q => q.eq('uploadId', uploadId))
              )
              .collect(),
            sr = await Promise.allSettled(chunks.map(async (chunk: Rec) => c.storage.delete(chunk.storageId as string)))
          for (const r of sr)
            if (r.status === 'rejected') log('warn', 'file:chunk_cleanup_failed', { reason: String(r.reason) })
          await Promise.all(chunks.map(async (chunk: Rec) => c.db.delete(chunk._id as string)))
          await c.db.patch(session._id as string, { status: 'failed' })
          return { cancelled: true }
        }
      } as never),
      getUploadProgress = query({
        args: { uploadId: v.string() },
        handler: async (c: { db: DbLike }, { uploadId }: { uploadId: string }) => {
          const userId = await authUserId(c)
          if (!userId) throw cvErr('NOT_AUTHENTICATED')
          const session = await c.db
            .query('uploadSession')
            .withIndex(
              'by_upload_id',
              idx(q => q.eq('uploadId', uploadId))
            )
            .unique()
          if (!session) return null
          if (session.userId !== userId) throw cvErr('UNAUTHORIZED')
          return {
            completedChunks: session.completedChunks,
            finalStorageId: session.finalStorageId,
            progress: Math.round(((session.completedChunks as number) / (session.totalChunks as number)) * 100),
            status: session.status,
            totalChunks: session.totalChunks
          }
        }
      } as never)
    return {
      assembleChunks,
      cancelChunkedUpload,
      CHUNK_SIZE,
      confirmChunk,
      finalizeAssembly,
      getSessionForAssembly,
      getUploadProgress,
      info,
      startChunkedUpload,
      upload,
      uploadChunk,
      validate
    }
  }

export { makeFileUpload }
