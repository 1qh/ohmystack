'use client'
import { useMemo } from 'react'
import { fileBlobUrl } from './provider'
interface FileRow {
  contentType: string
  data: unknown
  filename: string
  id: number
}
const cache = new Map<string, string>()
const toBytes = (data: unknown): ArrayLike<number> | null | Uint8Array => {
  if (data instanceof Uint8Array) return data
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)
  if (Array.isArray(data)) return data as number[]
  if (typeof data === 'object' && data !== null && 'length' in data) return data as ArrayLike<number>
  return null
}
const resolveFileUrl = (files: readonly FileRow[], ref: null | string | undefined): null | string => {
  if (!ref) return null
  if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('blob:') || ref.startsWith('data:'))
    return ref
  const cached = cache.get(ref)
  if (cached) return cached
  const match = files.find(f => ref.includes(f.filename) || String(f.id) === ref)
  if (!match) return null
  const bytes = toBytes(match.data)
  if (!bytes) return null
  const url = fileBlobUrl(bytes, match.contentType)
  cache.set(ref, url)
  return url
}
const useFileUrl = (files: readonly FileRow[], ref: null | string | undefined): null | string =>
  useMemo(() => resolveFileUrl(files, ref), [files, ref])
export type { FileRow }
export { resolveFileUrl, useFileUrl }
