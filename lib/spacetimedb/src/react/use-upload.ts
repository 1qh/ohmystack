'use client'
import { useRef, useState } from 'react'
interface RegisteredFile {
  storageId?: string
  url?: string
}
interface UploadCallOptions {
  signal?: AbortSignal
}
interface UploadConfig {
  registerFile?: (args: {
    contentType: string
    data: Uint8Array
    filename: string
    size: number
  }) => Promise<RegisteredFile>
}
type UploadOptions = UploadConfig
type UploadResult = { code: 'ABORTED' | 'NETWORK' | 'URL'; ok: false } | { ok: true; storageId: string; url?: string }
const OCTET_STREAM = 'application/octet-stream'
const toContentType = (file: File): string => file.type || OCTET_STREAM
const useUpload = (config?: UploadConfig) => {
  const [progress, setProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const [url, setUrl] = useState<null | string>(null)
  const latestUploadIdRef = useRef(0)
  const activeUploadsRef = useRef(0)
  const beginUpload = () => {
    activeUploadsRef.current += 1
    setIsUploading(true)
    setError(null)
  }
  const endUpload = () => {
    activeUploadsRef.current -= 1
    if (activeUploadsRef.current <= 0) setIsUploading(false)
  }
  const upload = async (file: File, options?: UploadCallOptions): Promise<UploadResult> => {
    const uploadId = latestUploadIdRef.current + 1
    latestUploadIdRef.current = uploadId
    beginUpload()
    setProgress(0)
    try {
      const buffer = await file.arrayBuffer()
      const data = new Uint8Array(buffer)
      if (uploadId === latestUploadIdRef.current) setProgress(50)
      if (options?.signal?.aborted) {
        setError('ABORTED')
        return { code: 'ABORTED', ok: false }
      }
      const registered = await config?.registerFile?.({
        contentType: toContentType(file),
        data,
        filename: file.name,
        size: file.size
      })
      if (uploadId === latestUploadIdRef.current) setProgress(100)
      const storageId = registered?.storageId ?? `${file.name}:${Date.now()}`
      if (registered?.url) setUrl(registered.url)
      return { ok: true, storageId, url: registered?.url }
    } catch {
      setError('NETWORK')
      return { code: 'NETWORK', ok: false }
    } finally {
      endUpload()
    }
  }
  return { error, isUploading, progress, upload, url }
}
export type { UploadCallOptions, UploadOptions, UploadResult }
export default useUpload
