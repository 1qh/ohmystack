/** biome-ignore-all lint/a11y/useSemanticElements: dropzone requires div role button */
// oxlint-disable promise/prefer-await-to-then, next/no-img-element
/* eslint-disable complexity */
// biome-ignore-all lint/performance/noImgElement: x
// biome-ignore-all lint/performance/noAwaitInLoops: x
// biome-ignore-all lint/suspicious/noExplicitAny: x
'use client'
import type { AnyFieldApi } from '@tanstack/react-form'
import type { FunctionReference } from 'convex/server'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@a/ui'
import { Field, FieldError, FieldLabel } from '@a/ui/field'
import imageCompression from 'browser-image-compression'
import { useQuery } from 'convex/react'
import { FileIcon, ImageIcon, Upload, X } from 'lucide-react'
import { createContext, use, useCallback, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'

import { BYTES_PER_KB, BYTES_PER_MB } from '../constants'
import useUpload from '../react/use-upload'

interface FileApi {
  info: FunctionReference<'query'>
  upload: FunctionReference<'mutation'>
}

const FileApiContext = createContext<FileApi | null>(null),
  FileApiProvider = ({ children, value }: { children: ReactNode; value: FileApi }) => (
    <FileApiContext value={value}>{children}</FileApiContext>
  ),
  useFileApi = () => {
    const ctx = use(FileApiContext)
    if (!ctx) throw new Error('FileApiProvider is required')
    return ctx
  },
  fmt = (n: number) =>
    n < BYTES_PER_KB
      ? `${n} B`
      : n < BYTES_PER_MB
        ? `${(n / BYTES_PER_KB).toFixed(1)} KB`
        : `${(n / BYTES_PER_MB).toFixed(1)} MB`,
  isImg = (t: string) => t.startsWith('image/'),
  parseAccept = (a?: string): Record<string, string[]> | undefined =>
    a ? Object.fromEntries(a.split(',').map(t => [t.trim(), []])) : undefined,
  compress = async (f: File, on: boolean) =>
    on && f.type.startsWith('image/')
      ? imageCompression(f, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true }).catch(() => f)
      : f,
  Preview = ({ id, onRemove }: { id: string; onRemove?: () => void }) => {
    const { info } = useFileApi(),
      d = useQuery(info, { id }) as null | undefined | { contentType: string; size: number; url: null | string }
    if (!d) return <p className='size-16 animate-pulse rounded-lg bg-muted' />
    return (
      <div className='relative'>
        {d.contentType && isImg(d.contentType) && d.url ? (
          <img alt='' className='size-16 rounded-lg object-cover' height={64} src={d.url} width={64} />
        ) : (
          <div className='flex size-16 flex-col items-center justify-center rounded-lg bg-muted text-xs'>
            <FileIcon className='size-6 text-muted-foreground' />
            <span className='mt-1'>{fmt(d.size)}</span>
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
  },
  Progress = ({ v }: { v: number }) => (
    <div className='flex flex-col items-center'>
      <div className='mb-2 h-2 w-32 overflow-hidden rounded-full bg-muted'>
        <div className='h-full bg-primary transition-all' style={{ width: `${v}%` }} />
      </div>
      <span className='text-sm text-muted-foreground'>{v}%</span>
    </div>
  ),
  FileFieldImpl = ({
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
    const { upload: uploadRef } = useFileApi(),
      raw = f.state.value,
      vals = useMemo(() => (multiple ? ((raw ?? []) as string[]) : raw ? [raw as string] : []), [multiple, raw]),
      inv = f.state.meta.isTouched && !f.state.meta.isValid,
      canAdd = multiple ? !max || vals.length < max : vals.length === 0,
      { isUploading, progress, reset, upload } = useUpload(uploadRef),
      errorId = `${f.name}-error`,
      onDrop = useCallback(
        async (accepted: File[]) => {
          if (multiple && max && vals.length + accepted.length > max) return toast.error(`Max ${max}`)
          const ids: string[] = []
          for (const file of accepted) {
            const res = await upload(await compress(file, compressImg))
            if (res.ok) ids.push(res.storageId)
            else if (res.code === 'HTTP') toast.error(`${file.name}: Upload failed (${res.status})`)
            else if (res.code === 'ABORTED') toast.error(`${file.name}: Upload canceled`)
            else if (res.code === 'NETWORK') toast.error(`${file.name}: Network error`)
            else if (res.code === 'INVALID_RESPONSE') toast.error(`${file.name}: Invalid response`)
            else toast.error(`${file.name}: Failed to start upload`)
          }
          if (multiple) f.handleChange([...vals, ...ids])
          else if (ids[0]) f.handleChange(ids[0])
        },
        [compressImg, f, max, multiple, upload, vals]
      ),
      { getInputProps, getRootProps, inputRef, isDragActive } = useDropzone({
        accept: parseAccept(accept),
        disabled: disabled ?? (isUploading || !canAdd),
        maxSize,
        multiple: Boolean(multiple),

        // eslint-disable-next-line @typescript-eslint/no-misused-promises, @typescript-eslint/strict-void-return
        onDrop,
        onDropRejected: r => {
          const code = r[0]?.errors[0]?.code
          if (code === 'file-too-large' && maxSize) toast.error(`Max ${fmt(maxSize)}`)
          else if (code === 'file-invalid-type') toast.error('Invalid type')
          else if (code === 'too-many-files' && max) toast.error(`Max ${max}`)
        }
      }),
      dropCls = cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
        multiple ? 'size-16' : 'p-6',
        isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
        (disabled ?? isUploading) && 'cursor-not-allowed opacity-50',
        dropClassName
      ),
      tid = testId ?? f.name
    return (
      <Field {...props} data-invalid={inv} data-testid={tid}>
        {label ? (
          <FieldLabel htmlFor={f.name}>
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
          <div className='flex flex-wrap gap-2'>
            {vals.map((id, i) => (
              <Preview id={id} key={id} onRemove={() => f.handleChange(vals.filter((_, j) => j !== i))} />
            ))}
            {canAdd ? (
              <div
                {...getRootProps()}
                aria-label='Upload file'
                className={dropCls}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()

                    inputRef.current.click()
                  }
                }}
                // biome-ignore lint/a11y/useSemanticElements: dropzone requires div
                role='button'
                tabIndex={0}>
                <input {...getInputProps()} aria-describedby={inv ? errorId : undefined} aria-invalid={inv} />
                {isUploading ? (
                  <span className='text-xs'>{progress}%</span>
                ) : (
                  <Upload className='size-5 text-muted-foreground' />
                )}
              </div>
            ) : null}
          </div>
        ) : vals[0] ? (
          <Preview
            id={vals[0]}
            onRemove={() => {
              f.handleChange(null)
              reset()
            }}
          />
        ) : (
          <div
            {...getRootProps()}
            aria-label='Upload file'
            className={dropCls}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()

                inputRef.current.click()
              }
            }}
            // biome-ignore lint/a11y/useSemanticElements: dropzone requires div
            role='button'
            tabIndex={0}>
            <input {...getInputProps()} aria-describedby={inv ? errorId : undefined} aria-invalid={inv} />
            {isUploading ? (
              <Progress v={progress} />
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
        )}
        {inv ? <FieldError errors={f.state.meta.errors} id={errorId} /> : null}
      </Field>
    )
  }

/** Exports FileFieldImpl component and file API context. */
export default FileFieldImpl
export { FileApiContext, FileApiProvider }
