'use client'
import { useMemo } from 'react'
import { fileBlobUrl } from './provider'
interface FileRow {
  contentType: string
  data: ArrayLike<number> | Uint8Array
  filename: string
  id: number
}
const cache = new Map<string, string>()
const resolveFileUrl = (files: FileRow[], ref: null | string | undefined): null | string => {
  if (!ref) return null
  if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('blob:') || ref.startsWith('data:'))
    return ref
  const cached = cache.get(ref)
  if (cached) return cached
  const match = files.find(f => ref.includes(f.filename) || String(f.id) === ref)
  if (!match) return null
  const url = fileBlobUrl(match.data, match.contentType)
  cache.set(ref, url)
  return url
}
const useFileUrl = (files: FileRow[], ref: null | string | undefined): null | string =>
  useMemo(() => resolveFileUrl(files, ref), [files, ref])
export type { FileRow }
export { resolveFileUrl, useFileUrl }
