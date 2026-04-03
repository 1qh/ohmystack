import type { Identity, Timestamp } from 'spacetimedb'
import type { AlgebraicTypeType, TypeBuilder } from 'spacetimedb/server'
import type { FileUploadConfig, FileUploadExports, FileUploadPkLike, FileUploadTableLike } from './types/file'
import { BYTES_PER_MB } from '../constants'
import { identityEquals, makeError } from './reducer-utils'
interface FileRowBase<Id> {
  contentType: string
  createdAt: Timestamp
  filename: string
  id: Id
  size: number
  storageKey: string
  uploadedAt: Timestamp
  userId: Identity
}
interface SenderLike {
  toHexString?: () => string
  toString?: () => string
}
/** Default MIME types accepted by noboil file upload reducers. */
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
])
const DEFAULT_MAX_FILE_SIZE_MB = 10
const CHUNK_SIZE_MB = 5
const DEFAULT_MAX_FILE_SIZE = DEFAULT_MAX_FILE_SIZE_MB * BYTES_PER_MB
const CHUNK_SIZE = CHUNK_SIZE_MB * BYTES_PER_MB
const ZERO_PREFIX_REGEX = /^0x/u
const normalizeHexIdentity = (sender: Identity): string => {
  const senderLike = sender as unknown as SenderLike
  const raw = typeof senderLike.toHexString === 'function' ? senderLike.toHexString() : (senderLike.toString?.() ?? '')
  return raw.trim().toLowerCase().replace(ZERO_PREFIX_REGEX, '')
}
const isAuthenticatedSender = (sender: Identity): boolean => {
  const normalized = normalizeHexIdentity(sender)
  if (!normalized) return false
  for (const ch of normalized) if (ch !== '0') return true
  return false
}
/** Creates reducers that register and delete uploaded file metadata.
 * @param spacetimedb - SpacetimeDB reducer factory
 * @param config - File upload reducer configuration
 * @returns Reducer export map
 * @example
 * ```ts
 * const uploads = makeFileUpload(spacetimedb, { namespace: 'avatars', fields, idField, pk, table })
 * ```
 */
const makeFileUpload = <
  DB,
  Id,
  Row extends FileRowBase<Id>,
  Tbl extends FileUploadTableLike<Row>,
  Pk extends FileUploadPkLike<Row, Id>
>(
  spacetimedb: {
    reducer: (
      opts: { name: string },
      params: Record<string, TypeBuilder<unknown, AlgebraicTypeType>>,
      fn: (ctx: { db: DB; sender: Identity; timestamp: Timestamp }, args: unknown) => void
    ) => unknown
  },
  config: FileUploadConfig<DB, Row, Id, Tbl, Pk>
): FileUploadExports => {
  const {
    allowedTypes = DEFAULT_ALLOWED_TYPES,
    fields,
    idField,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    namespace,
    pk: pkAccessor,
    table: tableAccessor
  } = config
  const registerName = `register_upload_${namespace}`
  const deleteName = `delete_file_${namespace}`
  const registerReducer = spacetimedb.reducer(
    { name: registerName },
    {
      contentType: fields.contentType as TypeBuilder<unknown, AlgebraicTypeType>,
      filename: fields.filename as TypeBuilder<unknown, AlgebraicTypeType>,
      size: fields.size as TypeBuilder<unknown, AlgebraicTypeType>,
      storageKey: fields.storageKey as TypeBuilder<unknown, AlgebraicTypeType>
    },
    (ctx, args) => {
      const typedArgs = args as {
        contentType: string
        filename: string
        size: number
        storageKey: string
      }
      if (!isAuthenticatedSender(ctx.sender)) throw makeError('NOT_AUTHENTICATED', `${namespace}:register`)
      if (!allowedTypes.has(typedArgs.contentType))
        throw makeError('INVALID_FILE_TYPE', `File type ${typedArgs.contentType} not allowed`)
      if (typedArgs.size > maxFileSize)
        throw makeError('FILE_TOO_LARGE', `File size ${typedArgs.size} exceeds ${maxFileSize} bytes`)
      const table = tableAccessor(ctx.db)
      table.insert({
        contentType: typedArgs.contentType,
        createdAt: ctx.timestamp,
        filename: typedArgs.filename,
        id: 0 as Id,
        size: typedArgs.size,
        storageKey: typedArgs.storageKey,
        uploadedAt: ctx.timestamp,
        userId: ctx.sender
      } as Row)
    }
  )
  const deleteReducer = spacetimedb.reducer(
    { name: deleteName },
    {
      fileId: idField as TypeBuilder<unknown, AlgebraicTypeType>
    },
    (ctx, args) => {
      const { fileId } = args as { fileId: Id }
      if (!isAuthenticatedSender(ctx.sender)) throw makeError('NOT_AUTHENTICATED', `${namespace}:delete`)
      const table = tableAccessor(ctx.db)
      const pk = pkAccessor(table)
      const row = pk.find(fileId)
      if (!row) throw makeError('NOT_FOUND', `${namespace}:delete`)
      if (!identityEquals(row.userId, ctx.sender)) throw makeError('FORBIDDEN', `${namespace}:delete`)
      const removed = pk.delete(fileId)
      if (!removed) throw makeError('NOT_FOUND', `${namespace}:delete`)
    }
  )
  const exportsRecord = {
    [deleteName]: deleteReducer,
    [registerName]: registerReducer
  } as unknown as FileUploadExports['exports']
  return {
    exports: exportsRecord
  }
}
export { createS3DownloadPresignedUrl, createS3UploadPresignedUrl } from '../s3'
export { CHUNK_SIZE, DEFAULT_ALLOWED_TYPES, DEFAULT_MAX_FILE_SIZE, makeFileUpload }
