// oxlint-disable no-document-cookie
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
const OCTET_STREAM = 'application/octet-stream'
const WS_TO_HTTP_RE = /^ws/u
const DEFAULT_SPACETIME_URI = 'ws://localhost:4000'
const DEFAULT_TOKEN_KEY = 'spacetimedb.token'
const TOKEN_COOKIE_KEY = 'spacetimedb_token'
const clientCache = new WeakMap<object, Map<string, unknown>>()
const getBuilderCache = <TBuilder>(factory: object): Map<string, TBuilder> => {
  const existing = clientCache.get(factory)
  if (existing) return existing as Map<string, TBuilder>
  const created = new Map<string, unknown>()
  clientCache.set(factory, created)
  return created as Map<string, TBuilder>
}
/**
 * Converts HTTP(S) endpoints to WebSocket endpoints used by SpacetimeDB clients.
 * @param uri Source URI that may use HTTP or WebSocket protocol.
 * @returns A URI using `ws://` or `wss://` when conversion is needed.
 */
const toWsUri = (uri: null | string | undefined): string => {
  if (!uri) return DEFAULT_SPACETIME_URI
  if (uri.startsWith('https://')) return uri.replace('https://', 'wss://')
  if (uri.startsWith('http://')) return uri.replace('http://', 'ws://')
  return uri
}
/**
 * Creates token persistence backed by localStorage and a browser cookie.
 * @param key Optional localStorage key for storing auth tokens.
 * @returns Token store helpers for reading and writing connection tokens.
 */
const createTokenStore = (key = DEFAULT_TOKEN_KEY): TokenStore => {
  const get = (): string | undefined => {
    if (typeof window === 'undefined') return
    const token = window.localStorage.getItem(key)
    return token ?? undefined
  }
  const store = (token: string) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, token)
    /** biome-ignore lint/suspicious/noDocumentCookie: token cookie storage */
    document.cookie = `${TOKEN_COOKIE_KEY}=${encodeURIComponent(token)}; Path=/; SameSite=Lax`
  }
  return { get, store }
}
/**
 * Creates an inline file uploader that stores bytes directly via SpacetimeDB reducer.
 * @param config.uri SpacetimeDB HTTP URI (e.g. http://localhost:4000)
 * @param config.moduleName SpacetimeDB module name
 * @param config.namespace Upload reducer namespace (default: 'file')
 * @param config.tokenStore Token store for auth
 * @returns An object implementing the FileApi upload contract.
 */
const createFileUploader = (config: {
  moduleName: string
  namespace?: string
  tokenStore: TokenStore
  uri: string
}): { upload: (file: File, options?: UploadOptions) => Promise<UploadResponse> } => {
  const { moduleName, namespace = 'file', tokenStore, uri } = config
  const httpUri = toWsUri(uri).replace(WS_TO_HTTP_RE, 'http')
  const reducerName = `register_upload_${namespace}`
  const upload = async (file: File, options?: UploadOptions): Promise<UploadResponse> => {
    const contentType = file.type || OCTET_STREAM
    const buffer = await file.arrayBuffer()
    const data = [...new Uint8Array(buffer)]
    options?.onProgress?.(50)
    const token = tokenStore.get()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const response = await fetch(`${httpUri}/v1/database/${moduleName}/call/${reducerName}`, {
      body: JSON.stringify({ contentType, data, filename: file.name, size: file.size }),
      headers,
      method: 'POST',
      signal: options?.signal
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      err('FILE_NOT_FOUND', { message: `File upload failed (HTTP ${response.status}): ${text}` })
    }
    options?.onProgress?.(100)
    const storageId = `${file.name}:${Date.now()}`
    const blobUrl = typeof Blob === 'undefined' ? storageId : URL.createObjectURL(new Blob([file], { type: contentType }))
    return { storageId, url: blobUrl }
  }
  return { upload }
}
const fileBlobUrl = (data: ArrayLike<number> | Uint8Array, contentType = 'application/octet-stream'): string => {
  if (typeof Blob === 'undefined') return ''
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  return URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: contentType }))
}
/**
 * Builds or reuses a cached SpacetimeDB connection builder for a URI and module pair.
 * @param options Factory options containing builder source, module metadata, URI, and optional token store.
 * @returns A configured connection builder instance ready for `SpacetimeDBProvider`.
 */
const createSpacetimeClient = <
  TBuilder extends SpacetimeConnectionBuilder<TBuilder, TConnection, TIdentity>,
  TConnection = unknown,
  TIdentity = unknown
>(
  options: CreateSpacetimeClientOptions<TBuilder, TConnection, TIdentity>
): TBuilder => {
  const { DbConnection, moduleName, tokenStore, uri } = options
  const resolvedUri = toWsUri(uri)
  const key = `${resolvedUri}::${moduleName}`
  const cache = getBuilderCache<TBuilder>(DbConnection)
  const existing = cache.get(key)
  const currentToken = tokenStore?.get()
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
export { createFileUploader, createSpacetimeClient, createTokenStore, fileBlobUrl, toWsUri }
