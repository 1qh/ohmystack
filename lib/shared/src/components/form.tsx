/** biome-ignore-all lint/nursery/noComponentHookFactories: factory returns hook by design */
'use client'
import type { ComponentProps, Context } from 'react'
import { cn } from '@a/ui'
import { Button } from '@a/ui/button'
import { Dialog, DialogContent } from '@a/ui/dialog'
import { useNavigationGuard } from 'next-navigation-guard'
import { use, useEffect } from 'react'
interface ConflictData {
  current?: unknown
  incoming?: unknown
}
type FileMeta = Record<string, { kind: string }>
type GuardAction = 'cancel' | 'overwrite' | 'reload'
interface GuardedFormState {
  isDirty: boolean
  isPending: boolean
}
const ConflictDialog = ({
  className,
  conflict,
  onResolve,
  ...props
}: Omit<ComponentProps<typeof DialogContent>, 'children'> & {
  conflict: ConflictData | null
  onResolve: (action: GuardAction) => void
}) => (
  <Dialog
    onOpenChange={open => {
      if (!open) onResolve('cancel')
    }}
    open={Boolean(conflict)}>
    <DialogContent className={cn('[&>button]:hidden', className)} {...props}>
      <h2 className='text-lg font-semibold'>Conflict Detected</h2>
      <p className='text-sm text-muted-foreground'>
        This record was modified by someone else. Choose how to resolve the conflict.
      </p>
      {conflict?.current || conflict?.incoming ? (
        <div className='space-y-3'>
          {conflict.current ? (
            <div className='rounded-lg bg-muted p-3'>
              <p className='mb-1 text-xs font-medium text-muted-foreground'>Server version:</p>
              <pre className='text-xs'>{JSON.stringify(conflict.current, null, 2)}</pre>
            </div>
          ) : null}
          {conflict.incoming ? (
            <div className='rounded-lg bg-muted p-3'>
              <p className='mb-1 text-xs font-medium text-muted-foreground'>Your version:</p>
              <pre className='text-xs'>{JSON.stringify(conflict.incoming, null, 2)}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className='flex justify-end gap-2'>
        <Button onClick={() => onResolve('cancel')} variant='outline'>
          Cancel
        </Button>
        <Button onClick={() => onResolve('reload')} variant='outline'>
          Reload
        </Button>
        <Button onClick={() => onResolve('overwrite')} variant='destructive'>
          Overwrite
        </Button>
      </div>
    </DialogContent>
  </Dialog>
)
const useWithGuard = <T extends GuardedFormState>(base: T): T & { guard: ReturnType<typeof useNavigationGuard> } => {
  const dirty = base.isDirty || base.isPending
  const guard = useNavigationGuard({ enabled: dirty })
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
  return { ...base, guard }
}
const hasFileFields = (meta: FileMeta): boolean => {
  for (const k of Object.keys(meta)) {
    const entry = meta[k]
    if (entry && (entry.kind === 'file' || entry.kind === 'files')) return true
  }
  return false
}
const createFileFieldWarning = <T,>({
  fileApiContext,
  messagePrefix
}: {
  fileApiContext: Context<T>
  messagePrefix: string
}) => {
  const FileFieldWarning = ({ meta }: { meta: FileMeta }) => {
    const fileCtx = use(fileApiContext)
    if (hasFileFields(meta) && !fileCtx)
      return <p className='sr-only'>{messagePrefix} Form schema has file fields but no FileApiProvider found.</p>
    return null
  }
  FileFieldWarning.displayName = 'FileFieldWarning'
  return FileFieldWarning
}
const AutoSaveIndicator = ({ className, lastSaved, ...props }: ComponentProps<'span'> & { lastSaved: null | number }) => {
  if (!lastSaved) return null
  return (
    <span className={cn('text-xs text-muted-foreground', className)} {...props}>
      Saved
    </span>
  )
}
interface AutoRenderMeta {
  kind: FieldKind
  title?: string
}
type FieldKind = 'boolean' | 'date' | 'file' | 'files' | 'number' | 'string' | 'stringArray' | 'unknown'
type FieldsLike = Record<string, (props: Record<string, unknown>) => unknown>
const autoRender = (f: FieldsLike, meta: Record<string, AutoRenderMeta>, exclude?: Set<string>) => {
  const kindToField: Record<FieldKind, string> = {
    boolean: 'Toggle',
    date: 'Datepick',
    file: 'File',
    files: 'Files',
    number: 'Num',
    string: 'Text',
    stringArray: 'Arr',
    unknown: 'Text'
  }
  const elements: unknown[] = []
  for (const [name, info] of Object.entries(meta))
    if (!exclude?.has(name)) {
      const component = f[kindToField[info.kind]]
      if (component) elements.push(component({ key: name, name }))
    }
  return elements
}
export { autoRender, AutoSaveIndicator, ConflictDialog, createFileFieldWarning, hasFileFields, useWithGuard }
export type { ConflictData }
