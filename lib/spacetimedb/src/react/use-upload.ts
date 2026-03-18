// biome-ignore-all lint/suspicious/useAwait: async without await
'use client'
// oxlint-disable promise/avoid-new

import { useRef, useState } from 'react'

import { err } from '../server/helpers'

interface PresignedUpload {
  headers?: Record<string, string>
  method?: 'POST' | 'PUT'
  storageKey: string
  uploadUrl: string
}

interface RegisteredFile {
  storageId?: string
  url?: string
}

interface UploadCallOptions {
  signal?: AbortSignal
}

interface UploadConfig {
  apiEndpoint?: string
  getPresignedUrl?: (file: File) => Promise<PresignedUpload>
  registerFile?: (args: {
    contentType: string
    filename: string
    size: number
    storageKey: string
  }) => Promise<RegisteredFile>
}

type UploadErrorCode = Exclude<UploadResult, { ok: true }>['code']

type UploadOptions = UploadConfig

type UploadResult =
  | { code: 'ABORTED' | 'NETWORK' | 'URL'; ok: false }
  | { code: 'HTTP'; ok: false; status: number }
  | { ok: true; storageId: string; url?: string }

const DEFAULT_API_ENDPOINT = '/api/upload/presign',
  HTTP_OK = 200,
  HTTP_REDIRECT = 300,
  OCTET_STREAM = 'application/octet-stream',
  toContentType = (file: File): string => file.type || OCTET_STREAM,
  toStringField = (obj: Record<string, unknown>, key: string): string | undefined => {
    const value = obj[key]
    return typeof value === 'string' ? value : undefined
  },
  toMethodField = (obj: Record<string, unknown>): 'POST' | 'PUT' | undefined => {
    const value = obj.method
    return value === 'POST' || value === 'PUT' ? value : undefined
  },
  toHeadersField = (obj: Record<string, unknown>): Record<string, string> => {
    const rawHeaders = obj.headers,
      headers: Record<string, string> = {}
    if (!(rawHeaders && typeof rawHeaders === 'object')) return headers
    const source = rawHeaders as Record<string, unknown>
    for (const key of Object.keys(source)) {
      const value = source[key]
      if (typeof value === 'string') headers[key] = value
    }
    return headers
  },
  parsePresignedPayload = (payload: unknown): PresignedUpload => {
    if (!(typeof payload === 'object' && payload !== null))
      return err('VALIDATION_FAILED', { message: 'Invalid upload URL payload' })
    const obj = payload as Record<string, unknown>,
      uploadUrl = toStringField(obj, 'uploadUrl'),
      storageKey = toStringField(obj, 'storageKey')
    if (!(uploadUrl && storageKey)) return err('VALIDATION_FAILED', { message: 'Invalid upload URL payload' })
    return {
      headers: toHeadersField(obj),
      method: toMethodField(obj),
      storageKey,
      uploadUrl
    }
  },
  requestPresignedUrl = async (apiEndpoint: string, file: File): Promise<PresignedUpload> => {
    const response = await fetch(apiEndpoint, {
        body: JSON.stringify({
          contentType: toContentType(file),
          filename: file.name,
          size: file.size
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      }),
      payload = (await response.json().catch((parseError: unknown) => {
        console.error('[@noboil/spacetimedb] Upload presign response is not valid JSON:', parseError) // eslint-disable-line no-console
        return null
      })) as unknown
    if (!response.ok) err('FILE_NOT_FOUND', { message: `Failed to create upload URL (HTTP ${response.status})` })
    if (payload === null) err('VALIDATION_FAILED', { message: 'Upload presign endpoint returned non-JSON response' })
    return parsePresignedPayload(payload)
  },
  hasContentTypeHeader = (headers: Record<string, string>): boolean => {
    const keys = Object.keys(headers)
    for (const key of keys) {
      const normalized = key.toLowerCase()
      if (normalized === 'content-type') return true
    }
    return false
  },
  applyHeaders = (xhr: XMLHttpRequest, headers: Record<string, string>) => {
    for (const key of Object.keys(headers)) {
      const value = headers[key]
      if (value) xhr.setRequestHeader(key, value)
    }
  },
  registerAbortListener = (xhr: XMLHttpRequest, signal?: AbortSignal): boolean => {
    if (!signal) return false
    if (signal.aborted) {
      xhr.abort()
      return true
    }
    const abortListener = () => xhr.abort()
    signal.addEventListener('abort', abortListener, { once: true })
    return false
  },
  makeUploadHandlers = (
    xhr: XMLHttpRequest,
    presigned: PresignedUpload,
    resolve: (value: UploadResult) => void
  ): { onAbort: () => void; onError: () => void; onLoad: () => void } => ({
    onAbort: () => resolve({ code: 'ABORTED', ok: false }),
    onError: () => resolve({ code: 'NETWORK', ok: false }),
    onLoad: () => {
      if (xhr.status < HTTP_OK || xhr.status >= HTTP_REDIRECT) {
        resolve({ code: 'HTTP', ok: false, status: xhr.status })
        return
      }
      resolve({ ok: true, storageId: presigned.storageKey })
    }
  }),
  addProgressListener = (xhr: XMLHttpRequest, onProgress: (progress: number) => void) => {
    const handleProgress = (event: ProgressEvent) => {
      if (!event.lengthComputable) return
      onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.upload.addEventListener('progress', handleProgress)
  },
  startXhrUpload = ({
    file,
    presigned,
    signal,
    xhr
  }: {
    file: File
    presigned: PresignedUpload
    signal?: AbortSignal
    xhr: XMLHttpRequest
  }): boolean => {
    const headers = { ...presigned.headers }
    xhr.open(presigned.method ?? 'PUT', presigned.uploadUrl)
    if (!hasContentTypeHeader(headers)) xhr.setRequestHeader('Content-Type', toContentType(file))
    applyHeaders(xhr, headers)
    return registerAbortListener(xhr, signal)
  },
  uploadWithXhr = async ({
    file,
    onProgress,
    presigned,
    signal
  }: {
    file: File
    onProgress: (progress: number) => void
    presigned: PresignedUpload
    signal?: AbortSignal
  }): Promise<UploadResult> =>
    new Promise(resolve => {
      const xhr = new XMLHttpRequest(),
        handlers = makeUploadHandlers(xhr, presigned, resolve),
        isAborted = startXhrUpload({ file, presigned, signal, xhr })
      xhr.addEventListener('error', handlers.onError)
      xhr.addEventListener('abort', handlers.onAbort)
      xhr.addEventListener('load', handlers.onLoad)
      addProgressListener(xhr, onProgress)
      if (isAborted) resolve({ code: 'ABORTED', ok: false })
      else xhr.send(file)
    }),
  /**
   * Manages file upload state with progress tracking and presigned URL flow.
   * @param config Optional upload endpoint and custom presign/register functions.
   * @returns Upload state (progress, error, url) and an `upload` executor.
   */
  useUpload = (config?: UploadConfig) => {
    const [progress, setProgress] = useState(0),
      [isUploading, setIsUploading] = useState(false),
      [error, setError] = useState<null | string>(null),
      [url, setUrl] = useState<null | string>(null),
      latestUploadIdRef = useRef(0),
      activeUploadsRef = useRef(0),
      getPresignedUrl =
        config?.getPresignedUrl ??
        (async (file: File) => requestPresignedUrl(config?.apiEndpoint ?? DEFAULT_API_ENDPOINT, file)),
      beginUpload = () => {
        activeUploadsRef.current += 1
        setIsUploading(true)
        setError(null)
      },
      endUpload = () => {
        activeUploadsRef.current -= 1
        if (activeUploadsRef.current <= 0) setIsUploading(false)
      },
      register = async (file: File, storageKey: string): Promise<RegisteredFile | undefined> => {
        if (!config?.registerFile) return
        return config.registerFile({
          contentType: toContentType(file),
          filename: file.name,
          size: file.size,
          storageKey
        })
      },
      setUploadProgress = (uploadId: number, value: number) => {
        if (uploadId === latestUploadIdRef.current) setProgress(value)
      },
      onUploadError = (code: UploadErrorCode) => {
        setError(code)
      },
      completeUpload = (uploadId: number, storageId: string, nextUrl?: string): UploadResult => {
        if (nextUrl) setUrl(nextUrl)
        if (uploadId === latestUploadIdRef.current) setProgress(100)
        return { ok: true, storageId, url: nextUrl }
      },
      runUpload = async (file: File, uploadId: number, signal?: AbortSignal): Promise<UploadResult> => {
        const presigned = await getPresignedUrl(file),
          uploaded = await uploadWithXhr({
            file,
            onProgress: value => setUploadProgress(uploadId, value),
            presigned,
            signal
          })
        if (!uploaded.ok) {
          onUploadError(uploaded.code)
          return uploaded
        }
        const registered = await register(file, presigned.storageKey)
        return completeUpload(uploadId, registered?.storageId ?? presigned.storageKey, registered?.url)
      },
      upload = async (file: File, options?: UploadCallOptions): Promise<UploadResult> => {
        const uploadId = latestUploadIdRef.current + 1
        latestUploadIdRef.current = uploadId
        beginUpload()
        setProgress(0)
        try {
          return await runUpload(file, uploadId, options?.signal)
        } catch {
          onUploadError('URL')
          return { code: 'URL', ok: false }
        } finally {
          endUpload()
        }
      }

    return { error, isUploading, progress, upload, url }
  }

export type { UploadCallOptions, UploadOptions, UploadResult }
export default useUpload
