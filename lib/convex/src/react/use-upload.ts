/* oxlint-disable eslint/no-await-in-loop */
// oxlint-disable unicorn/prefer-add-event-listener
/* eslint-disable no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: retry logic */
'use client'
import type { FunctionReference } from 'convex/server'
import { useMutation } from 'convex/react'
import { useRef, useState } from 'react'
import { sleep } from '../constants'
/** Options for useUpload: retry count and delay between retries. */
interface UploadOptions {
  retries?: number
  retryDelay?: number
}
/** Result of an upload attempt — either success with a storageId or failure with an error code. */
type UploadResult =
  | { code: 'ABORTED' | 'INVALID_RESPONSE' | 'NETWORK' | 'URL'; ok: false }
  | { code: 'HTTP'; ok: false; status: number }
  | { ok: true; storageId: string }
/** Manages file uploads to Convex storage with progress tracking, retry logic, and abort support. */
const useUpload = (uploadMutation: FunctionReference<'mutation'>, options?: UploadOptions) => {
  const DEFAULT_RETRIES = 3
  const DEFAULT_RETRY_DELAY = 1000
  const { retries = DEFAULT_RETRIES, retryDelay = DEFAULT_RETRY_DELAY } = options ?? {}
  const getUrl = useMutation(uploadMutation)
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const xhrRef = useRef<null | XMLHttpRequest>(null)
  const reset = () => {
    setUploading(false)
    setProgress(0)
    setAttempt(0)
  }
  const uploadOnce = async (file: File): Promise<UploadResult> => {
    try {
      const url = (await getUrl()) as string
      // oxlint-disable-next-line promise/param-names
      return await new Promise(res => {
        const x = new XMLHttpRequest()
        xhrRef.current = x
        x.upload.onprogress = e => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100))
        x.onload = () => {
          const HTTP_OK = 200
          const HTTP_REDIRECT = 300
          if (x.status < HTTP_OK || x.status >= HTTP_REDIRECT) return res({ code: 'HTTP', ok: false, status: x.status })
          try {
            const parsed: unknown = JSON.parse(x.responseText)
            const storageId =
              typeof parsed === 'object' && parsed !== null && 'storageId' in parsed
                ? (parsed as { storageId: unknown }).storageId
                : undefined
            if (typeof storageId !== 'string') return res({ code: 'INVALID_RESPONSE', ok: false })
            setProgress(100)
            res({ ok: true, storageId })
          } catch {
            res({ code: 'INVALID_RESPONSE', ok: false })
          }
        }
        x.onerror = () => res({ code: 'NETWORK', ok: false })
        x.onabort = () => res({ code: 'ABORTED', ok: false })
        x.open('POST', url)
        x.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        x.send(file)
      })
    } catch {
      return { code: 'URL', ok: false }
    }
  }
  const upload = async (file: File): Promise<UploadResult> => {
    setUploading(true)
    setProgress(0)
    setAttempt(0)
    try {
      for (let i = 0; i < retries; i += 1) {
        setAttempt(i + 1)
        const result = await uploadOnce(file)
        if (result.ok || result.code === 'ABORTED') return result
        if (i < retries - 1) await sleep(retryDelay * (i + 1))
      }
      return { code: 'NETWORK', ok: false }
    } finally {
      setUploading(false)
    }
  }
  return {
    attempt,
    cancel: () => {
      xhrRef.current?.abort()
      reset()
    },
    isUploading: uploading,
    progress,
    reset,
    upload
  }
}
export type { UploadOptions, UploadResult }
export default useUpload
