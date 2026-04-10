// biome-ignore-all lint/a11y/useSemanticElements: intentional div usage
/** biome-ignore-all lint/nursery/noInlineStyles: dynamic percentage width */
'use client'
import type { AnyFieldApi } from '@tanstack/react-form'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@a/ui'
import { Field, FieldError, FieldLabel } from '@a/ui/field'
import imageCompression from 'browser-image-compression'
import { FileIcon, ImageIcon, Upload, X } from 'lucide-react'
import Image from 'next/image'
import { createContext, use, useCallback, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import { BYTES_PER_KB, BYTES_PER_MB } from '../constants'
import { noop } from '../react/list-utils'
interface DropSlotProps {
  accept?: string
  compact?: boolean
  dropCls: string
  errorId: string
  inputProps: ReturnType<ReturnType<typeof useDropzone>['getInputProps']>
  inputRef: { current: HTMLInputElement | null }
  inv: boolean
  isUploading: boolean
  maxSize?: number
  progress: number
  rootProps: ReturnType<ReturnType<typeof useDropzone>['getRootProps']>
}
interface FileApi {
  upload: (file: File, options?: UploadOptions) => Promise<UploadResponse>
}
interface MultipleValueProps extends DropSlotProps {
  canAdd: boolean
  f: AnyFieldApi
  vals: string[]
}
interface SingleValueProps extends DropSlotProps {
  f: AnyFieldApi
  onReset: () => void
  vals: string[]
}
interface UploadOptions {
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}
type UploadResponse =
  | string
  | {
      storageId?: string
      url?: string
    }
interface UploadState {
  isUploading: boolean
  progress: number
  reset: () => void
  upload: (file: File) => Promise<null | string>
}
/** React context for the file upload API configuration. */
const FileApiContext = createContext<FileApi | null>(null)
/** Provides file upload API config (presign endpoint, callbacks) to nested components. */
const FileApiProvider = ({ children, value }: { children: ReactNode; value: FileApi }) => (
  <FileApiContext value={value}>{children}</FileApiContext>
)
const useFileApi = () => {
  const ctx = use(FileApiContext)
  if (!ctx) throw new Error('FileApiProvider is required')
  return ctx
}
const fmt = (n: number) =>
  n < BYTES_PER_KB
    ? `${n} B`
    : n < BYTES_PER_MB
      ? `${(n / BYTES_PER_KB).toFixed(1)} KB`
      : `${(n / BYTES_PER_MB).toFixed(1)} MB`
const isImgType = (t: string) => t.startsWith('image/')
const isImgUrl = (url: string) => {
  const lower = url.toLowerCase()
  if (lower.startsWith('data:image/') || lower.startsWith('blob:')) return true
  return (
    lower.includes('.png') ||
    lower.includes('.jpg') ||
    lower.includes('.jpeg') ||
    lower.includes('.gif') ||
    lower.includes('.webp') ||
    lower.includes('.svg') ||
    lower.includes('.bmp') ||
    lower.includes('.avif')
  )
}
const getLastPath = (pathname: string): string => {
  const parts = pathname.split('/')
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i]
    if (part) return part
  }
  return ''
}
const fileLabel = (url: string) => {
  try {
    const parsed = new URL(url)
    const part = getLastPath(parsed.pathname)
    return decodeURIComponent(part || 'File')
  } catch {
    return 'File'
  }
}
const parseAccept = (a?: string): Record<string, string[]> | undefined =>
  a ? Object.fromEntries(a.split(',').map(t => [t.trim(), []])) : undefined
const compress = async (f: File, on: boolean) => {
  if (!(on && isImgType(f.type))) return f
  try {
    return await imageCompression(f, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true })
  } catch {
    return f
  }
}
const getUploadedValue = (result: UploadResponse): null | string => {
  if (typeof result === 'string') return result
  if (typeof result.url === 'string' && result.url) return result.url
  if (typeof result.storageId === 'string' && result.storageId) return result.storageId
  return null
}
const Progress = ({ v }: { v: number }) => (
  <div className='flex flex-col items-center'>
    <div className='mb-2 h-2 w-32 overflow-hidden rounded-full bg-muted'>
      {/* oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop */}
      <div className='h-full bg-primary transition-all' style={{ width: `${v}%` }} />
    </div>
    <span className='text-sm text-muted-foreground'>{v}%</span>
  </div>
)
const Preview = ({ id, onRemove }: { id: string; onRemove?: () => void }) => (
  <div className='relative'>
    {isImgUrl(id) ? (
      <Image alt='' className='size-16 rounded-lg object-cover' height={64} src={id} unoptimized width={64} />
    ) : (
      <div className='flex size-16 flex-col items-center justify-center rounded-lg bg-muted text-xs'>
        <FileIcon className='size-6 text-muted-foreground' />
        <span className='mt-1 line-clamp-1 max-w-14 px-0.5 text-center'>{fileLabel(id)}</span>
      </div>
    )}
    {onRemove ? (
      <button
        className='absolute -top-2 -right-2 rounded-full bg-destructive p-1 text-white transition-transform hover:scale-110'
        onClick={onRemove}
        type='button'>
        <X className='size-3' />
      </button>
    ) : null}
  </div>
)
const DropSlot = ({
  accept,
  compact,
  dropCls,
  errorId,
  inputProps,
  inputRef,
  inv,
  isUploading,
  maxSize,
  progress,
  rootProps
}: DropSlotProps) => (
  <div
    {...rootProps}
    aria-label='Upload file'
    className={dropCls}
    onKeyDown={e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        inputRef.current?.click()
      }
    }}
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    role='button'
    tabIndex={0}>
    <input {...inputProps} aria-describedby={inv ? errorId : undefined} aria-invalid={inv} />
    {isUploading ? (
      compact ? (
        <span className='text-xs'>{progress}%</span>
      ) : (
        <Progress v={progress} />
      )
    ) : compact ? (
      <Upload className='size-5 text-muted-foreground' />
    ) : (
      <>
        {accept?.includes('image') ? (
          <ImageIcon className='mb-2 size-8 text-muted-foreground' />
        ) : (
          <Upload className='mb-2 size-8 text-muted-foreground' />
        )}
        <span className='text-sm text-muted-foreground'>Click or drag</span>
        {maxSize ? <span className='mt-1 text-xs text-muted-foreground'>Max {fmt(maxSize)}</span> : null}
      </>
    )}
  </div>
)
const MultipleValue = ({ canAdd, f, vals, ...drop }: MultipleValueProps) => (
  <div className='flex flex-wrap gap-2'>
    {vals.map((id, i) => (
      <Preview id={id} key={id} onRemove={() => f.handleChange(vals.filter((_, j) => j !== i))} />
    ))}
    {canAdd ? <DropSlot compact {...drop} /> : null}
  </div>
)
const SingleValue = ({ f, onReset, vals, ...drop }: SingleValueProps) =>
  vals[0] ? (
    <Preview
      id={vals[0]}
      onRemove={() => {
        f.handleChange(null)
        onReset()
      }}
    />
  ) : (
    <DropSlot {...drop} />
  )
const useFileUpload = (uploadFile: FileApi['upload']): UploadState => {
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const reset = () => {
    setIsUploading(false)
    setProgress(0)
  }
  const uploadOnce = async (file: File, controller: AbortController): Promise<null | string> => {
    try {
      const result = await uploadFile(file, {
        onProgress: n => setProgress(Math.max(0, Math.min(100, Math.round(n)))),
        signal: controller.signal
      })
      const value = getUploadedValue(result)
      if (value) setProgress(100)
      return value
    } catch {
      return null
    }
  }
  const upload = async (file: File): Promise<null | string> => {
    setIsUploading(true)
    setProgress(0)
    const controller = new AbortController()
    abortRef.current = controller
    const value = await uploadOnce(file, controller)
    setIsUploading(false)
    return value
  }
  return { isUploading, progress, reset, upload }
}
const uploadFiles = async ({
  accepted,
  compressImg,
  upload
}: {
  accepted: File[]
  compressImg: boolean
  upload: (file: File) => Promise<null | string>
}) => {
  const ids: string[] = []
  const tasks: Promise<{ name: string; value: null | string }>[] = []
  for (const file of accepted)
    tasks.push(
      (async () => {
        const compressed = await compress(file, compressImg)
        const value = await upload(compressed)
        return { name: file.name, value }
      })()
    )
  const results = await Promise.all(tasks)
  for (const result of results)
    if (result.value) ids.push(result.value)
    else toast.error(`${result.name}: Upload failed`)
  return ids
}
const useUploadDropzone = ({
  accept,
  canAdd,
  disabled,
  isUploading,
  max,
  maxSize,
  multiple,
  onDrop
}: {
  accept?: string
  canAdd: boolean
  disabled?: boolean
  isUploading: boolean
  max?: number
  maxSize?: number
  multiple?: boolean
  onDrop: (accepted: File[]) => void
}) =>
  useDropzone({
    accept: parseAccept(accept),
    disabled: disabled ?? (isUploading || !canAdd),
    maxSize,
    multiple: Boolean(multiple),
    onDrop,
    onDropRejected: r => {
      const code = r[0]?.errors[0]?.code
      if (code === 'file-too-large' && maxSize) toast.error(`Max ${fmt(maxSize)}`)
      else if (code === 'file-invalid-type') toast.error('Invalid type')
      else if (code === 'too-many-files' && max) toast.error(`Max ${max}`)
    }
  })
/** File upload field implementation with drag-and-drop and progress. */
const FileFieldImpl = ({
  accept,
  compressImg = true,
  'data-testid': testId,
  disabled,
  dropClassName,
  field: f,
  label,
  max,
  maxSize,
  multiple,
  ...props
}: Omit<ComponentProps<typeof Field>, 'children'> & {
  accept?: string
  compressImg?: boolean
  'data-testid'?: string
  disabled?: boolean
  dropClassName?: string
  field: AnyFieldApi
  label?: string
  max?: number
  maxSize?: number
  multiple?: boolean
}) => {
  const { upload: uploadFile } = useFileApi()
  const raw: unknown = f.state.value as unknown
  const vals = useMemo(() => (multiple ? ((raw ?? []) as string[]) : raw ? [raw as string] : []), [multiple, raw])
  const inv = f.state.meta.isTouched && !f.state.meta.isValid
  const canAdd = multiple ? !max || vals.length < max : vals.length === 0
  const { isUploading, progress, reset, upload } = useFileUpload(uploadFile)
  const errorId = `${f.name}-error`
  const onDropAsync = useCallback(
    async (accepted: File[]) => {
      if (multiple && max && vals.length + accepted.length > max) {
        toast.error(`Max ${max}`)
        return
      }
      const ids = await uploadFiles({ accepted, compressImg, upload })
      if (ids.length === 0) return
      if (multiple) f.handleChange([...vals, ...ids])
      else if (ids[0]) f.handleChange(ids[0])
    },
    [compressImg, f, max, multiple, upload, vals]
  )
  const { getInputProps, getRootProps, inputRef, isDragActive } = useUploadDropzone({
    accept,
    canAdd,
    disabled,
    isUploading,
    max,
    maxSize,
    multiple,
    onDrop: (accepted: File[]) => {
      // oxlint-disable-next-line promise/prefer-await-to-then, promise/catch-or-return, promise/prefer-catch
      onDropAsync(accepted).then(noop, noop)
    }
  })
  const dropCls = cn(
    'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
    multiple ? 'size-16' : 'p-6',
    isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
    (disabled ?? isUploading) && 'cursor-not-allowed opacity-50',
    dropClassName
  )
  const tid = typeof testId === 'string' ? testId : String(f.name)
  const inputProps = getInputProps()
  const rootProps = getRootProps()
  const dropProps = { accept, dropCls, errorId, inputProps, inputRef, inv, isUploading, maxSize, progress, rootProps }
  return (
    <Field {...props} data-invalid={inv} data-testid={tid}>
      {label ? (
        <FieldLabel htmlFor={String(f.name)}>
          {label}
          {multiple && max ? (
            <span className='text-muted-foreground'>
              {' '}
              ({vals.length}/{max})
            </span>
          ) : null}
        </FieldLabel>
      ) : null}
      {multiple ? (
        <MultipleValue canAdd={canAdd} f={f} vals={vals} {...dropProps} />
      ) : (
        <SingleValue f={f} onReset={reset} vals={vals} {...dropProps} />
      )}
      {inv ? <FieldError errors={f.state.meta.errors} id={errorId} /> : null}
    </Field>
  )
}
export type { FileApi, UploadOptions, UploadResponse }
export default FileFieldImpl
export { FileApiContext, FileApiProvider }
