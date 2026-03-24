// oxlint-disable no-document-cookie
// oxlint-disable promise/avoid-new
// biome-ignore-all lint/nursery/useGlobalThis: browser API
import type { UploadOptions, UploadResponse } from '../components'
import { err } from '../server/helpers'
interface CreateSpacetimeClientOptions<
  TBuilder extends SpacetimeConnectionBuilder<TBuilder, TConnection, TIdentity>,
  TConnection = unknown,
  TIdentity = unknown
> {
  DbConnection: object & SpacetimeConnectionFactory<TBuilder>
  moduleName: string
  tokenStore?: TokenStore
  uri: string
}
interface ParsedPresignPayload {
  headers: Record<string, string>
  method?: string
  storageKey: string
  uploadUrl: string
}
interface SpacetimeConnectionBuilder<TBuilder, TConnection = unknown, TIdentity = unknown> {
  onConnect: (callback: (connection: TConnection, identity: TIdentity, token: string) => void) => TBuilder
  withDatabaseName: (moduleName: string) => TBuilder
  withToken: (token: string | undefined) => TBuilder
  withUri: (uri: string) => TBuilder
}
interface SpacetimeConnectionFactory<TBuilder> {
  builder: () => TBuilder
}
interface TokenStore {
  get: () => string | undefined
  store: (token: string) => void
}
const HTTP_OK = 200,
  HTTP_REDIRECT = 300,
  OCTET_STREAM = 'application/octet-stream',
  DEFAULT_SPACETIME_URI = 'ws://localhost:3000',
  DEFAULT_TOKEN_KEY = 'spacetimedb.token',
  TOKEN_COOKIE_KEY = 'spacetimedb_token',
  clientCache = new WeakMap<object, Map<string, unknown>>(),
  toRecord = (value: unknown): null | Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : null,
  getString = (record: Record<string, unknown>, key: string): string | undefined => {
    const value = record[key]
    return typeof value === 'string' ? value : undefined
  },
  parseHeaders = (value: unknown): Record<string, string> => {
    const record = toRecord(value)
    if (!record) return {}
    const headers: Record<string, string> = {}
    for (const key of Object.keys(record)) {
      const headerValue = record[key]
      if (typeof headerValue === 'string') headers[key] = headerValue
    }
    return headers
  },
  parsePresignPayload = (payload: unknown): ParsedPresignPayload => {
    const record = toRecord(payload)
    if (!record) return err('VALIDATION_FAILED', { message: 'Invalid presign payload' })
    const uploadUrl = getString(record, 'uploadUrl'),
      storageKey = getString(record, 'storageKey'),
      method = getString(record, 'method')
    if (!(uploadUrl && storageKey)) return err('VALIDATION_FAILED', { message: 'Invalid presign payload' })
    return {
      headers: parseHeaders(record.headers),
      method,
      storageKey,
      uploadUrl
    }
  },
  hasContentTypeHeader = (headers: Record<string, string>): boolean => {
    for (const key of Object.keys(headers)) if (key.toLowerCase() === 'content-type') return true
    return false
  },
  getBuilderCache = <TBuilder>(factory: object): Map<string, TBuilder> => {
    const existing = clientCache.get(factory)
    if (existing) return existing as Map<string, TBuilder>
    const created = new Map<string, unknown>()
    clientCache.set(factory, created)
    return created as Map<string, TBuilder>
  },
  applyHeaders = (xhr: XMLHttpRequest, headers: Record<string, string>) => {
    for (const key of Object.keys(headers)) {
      const value = headers[key]
      if (value) xhr.setRequestHeader(key, value)
    }
  },
  /**
   * Converts HTTP(S) endpoints to WebSocket endpoints used by SpacetimeDB clients.
   * @param uri Source URI that may use HTTP or WebSocket protocol.
   * @returns A URI using `ws://` or `wss://` when conversion is needed.
   */
  toWsUri = (uri: null | string | undefined): string => {
    if (!uri) return DEFAULT_SPACETIME_URI
    if (uri.startsWith('https://')) return uri.replace('https://', 'wss://')
    if (uri.startsWith('http://')) return uri.replace('http://', 'ws://')
    return uri
  },
  /**
   * Creates token persistence backed by localStorage and a browser cookie.
   * @param key Optional localStorage key for storing auth tokens.
   * @returns Token store helpers for reading and writing connection tokens.
   */
  createTokenStore = (key = DEFAULT_TOKEN_KEY): TokenStore => {
    const get = (): string | undefined => {
        if (typeof window === 'undefined') return
        const token = window.localStorage.getItem(key)
        return token ?? undefined
      },
      store = (token: string) => {
        if (typeof window === 'undefined') return
        window.localStorage.setItem(key, token)
        /** biome-ignore lint/suspicious/noDocumentCookie: token cookie storage */
        document.cookie = `${TOKEN_COOKIE_KEY}=${encodeURIComponent(token)}; Path=/; SameSite=Lax`
      }
    return { get, store }
  },
  /**
   * Creates a generic uploader that requests a presigned URL and streams file bytes via XHR.
   * @param presignEndpoint API endpoint that returns upload URL, storage key, and optional headers.
   * @returns An object implementing the FileApi upload contract.
   */
  createFileUploader = (
    presignEndpoint: string
  ): { upload: (file: File, options?: UploadOptions) => Promise<UploadResponse> } => {
    const upload = async (file: File, options?: UploadOptions): Promise<UploadResponse> => {
      const contentType = file.type || OCTET_STREAM,
        response = await fetch(presignEndpoint, {
          body: JSON.stringify({ contentType, filename: file.name, size: file.size }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
          signal: options?.signal
        })
      if (!response.ok) err('FILE_NOT_FOUND', { message: `Failed to get presigned URL (HTTP ${response.status})` })
      const payload = (await response
          .json()
          .catch(() => err('VALIDATION_FAILED', { message: 'Presign endpoint returned non-JSON response' }))) as unknown,
        presigned = parsePresignPayload(payload)
      return new Promise<UploadResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest(),
          { headers } = presigned,
          method = presigned.method ?? 'PUT',
          signal = options?.signal
        let settled = false
        const resolveOnce = (value: UploadResponse) => {
            if (settled) return
            settled = true
            resolve(value)
          },
          rejectOnce = (error: Error) => {
            if (settled) return
            settled = true
            reject(error)
          }
        xhr.open(method, presigned.uploadUrl)
        applyHeaders(xhr, headers)
        if (!hasContentTypeHeader(headers)) xhr.setRequestHeader('Content-Type', contentType)
        if (options?.onProgress)
          xhr.upload.addEventListener('progress', event => {
            if (event.lengthComputable && options.onProgress)
              options.onProgress(Math.round((event.loaded / event.total) * 100))
          })
        xhr.addEventListener('load', () => {
          if (xhr.status >= HTTP_OK && xhr.status < HTTP_REDIRECT) {
            const [url] = presigned.uploadUrl.split('?')
            resolveOnce({ storageId: presigned.storageKey, url })
            return
          }
          rejectOnce(new Error(`Upload failed with HTTP ${xhr.status} — check endpoint URL and CORS configuration`))
        })
        xhr.addEventListener('error', () =>
          rejectOnce(
            new Error('Upload network error — check CORS headers, network connectivity, and endpoint availability')
          )
        )
        xhr.addEventListener('abort', () => rejectOnce(new Error('Upload aborted')))
        if (signal) {
          if (signal.aborted) {
            xhr.abort()
            rejectOnce(new Error('Upload aborted'))
            return
          }
          signal.addEventListener('abort', () => xhr.abort(), { once: true })
        }
        xhr.send(file)
      })
    }
    return { upload }
  },
  /**
   * Builds or reuses a cached SpacetimeDB connection builder for a URI and module pair.
   * @param options Factory options containing builder source, module metadata, URI, and optional token store.
   * @returns A configured connection builder instance ready for `SpacetimeDBProvider`.
   */
  createSpacetimeClient = <
    TBuilder extends SpacetimeConnectionBuilder<TBuilder, TConnection, TIdentity>,
    TConnection = unknown,
    TIdentity = unknown
  >(
    options: CreateSpacetimeClientOptions<TBuilder, TConnection, TIdentity>
  ): TBuilder => {
    const { DbConnection, moduleName, tokenStore, uri } = options,
      resolvedUri = toWsUri(uri),
      key = `${resolvedUri}::${moduleName}`,
      cache = getBuilderCache<TBuilder>(DbConnection),
      existing = cache.get(key),
      currentToken = tokenStore?.get()
    if (existing) {
      const cachedToken = (existing as unknown as { _cachedToken?: string })._cachedToken
      if (cachedToken && cachedToken === currentToken) return existing
      cache.delete(key)
    }
    const builder = DbConnection.builder()
      .withUri(resolvedUri)
      .withDatabaseName(moduleName)
      .withToken(currentToken)
      .onConnect((_connection, _identity, token) => {
        if (tokenStore) tokenStore.store(token)
      })
    ;(builder as unknown as { _cachedToken?: string })._cachedToken = currentToken
    cache.set(key, builder)
    return builder
  }
export type { CreateSpacetimeClientOptions, SpacetimeConnectionBuilder, SpacetimeConnectionFactory, TokenStore }
export { createFileUploader, createSpacetimeClient, createTokenStore, toWsUri }
