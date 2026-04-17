// biome-ignore-all lint/nursery/noLeakedRender: conditional rendering
/** biome-ignore-all lint/nursery/noRedundantDefaultExport: backward-compat alias */
/* eslint-disable complexity, @eslint-react/hooks-extra/no-direct-set-state-in-use-effect, react-hooks/refs */
/* oxlint-disable eslint/complexity, react-hooks/refs */
// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
'use client'
import { CacheRow, formatTime, MAX_BADGE, POSITION_CLASSES, TabBtn, WaterfallBar } from '@a/shared/react/devtools-panel'
import { cn } from '@a/ui'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ErrorCode } from '../server/types'
import type { DevConnection, DevError, DevMutation, DevSubscription } from './devtools'
import { ERROR_MESSAGES } from '../server/types'
import { injectError, SLOW_THRESHOLD_MS, STALE_THRESHOLD_MS, useDevErrors } from './devtools'
interface DevtoolsProps {
  buttonClassName?: string
  className?: string
  defaultOpen?: boolean
  defaultTab?: TabId
  panelClassName?: string
  position?: Position
}
type Position = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
type TabId = 'cache' | 'errors' | 'reducers' | 'subs'
const isStale = (sub: DevSubscription) => sub.status === 'loaded' && Date.now() - sub.lastUpdate > STALE_THRESHOLD_MS
const isSlow = (sub: DevSubscription) => sub.latencyMs > SLOW_THRESHOLD_MS
const ConnectionBadge = ({ connection }: { connection: DevConnection }) => {
  const dotClass = connection.isActive ? 'bg-primary' : 'bg-destructive'
  const status = connection.isActive ? 'connected' : 'disconnected'
  return (
    <div className='flex items-center gap-2 rounded-sm bg-background/80 px-2 py-1 text-xs'>
      <span className={cn('size-1.5 rounded-full', dotClass)} />
      <span className='font-mono text-foreground'>{status}</span>
      {connection.connectionId ? (
        <span className='max-w-20 truncate font-mono text-muted-foreground' title={connection.connectionId}>
          {connection.connectionId}
        </span>
      ) : null}
    </div>
  )
}
const ErrorRow = ({ error }: { error: DevError }) => {
  const [expanded, setExpanded] = useState(false)
  const code = error.data?.code
  const table = error.data?.table
  const op = error.data?.op
  return (
    <li className='border-b border-destructive/30 last:border-b-0'>
      <button
        className='flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-destructive/30'
        onClick={() => setExpanded(v => !v)}
        type='button'>
        <span className='shrink-0 pt-px font-mono text-destructive/60'>{formatTime(error.timestamp)}</span>
        {code ? (
          <span className='shrink-0 rounded-sm bg-destructive/50 px-1 font-mono text-destructive'>{code}</span>
        ) : null}
        <span className='min-w-0 flex-1 truncate text-destructive'>{error.message}</span>
        <span className='shrink-0 text-destructive/40'>{expanded ? '^' : 'v'}</span>
      </button>
      {expanded ? (
        <div className='space-y-1 bg-destructive/20 px-3 py-2 text-xs'>
          {table || op ? (
            <p className='font-mono text-destructive/80'>
              {table ? `table: ${table}` : ''}
              {table && op ? ' . ' : ''}
              {op ? `op: ${op}` : ''}
            </p>
          ) : null}
          <p className='break-all whitespace-pre-wrap text-destructive/90'>{error.detail}</p>
        </div>
      ) : null}
    </li>
  )
}
const SubRow = ({ sub }: { sub: DevSubscription }) => {
  const [expanded, setExpanded] = useState(false)
  const stale = isStale(sub)
  const slow = isSlow(sub)
  const statusColor =
    sub.status === 'loaded'
      ? stale
        ? 'text-foreground'
        : 'text-primary'
      : sub.status === 'error'
        ? 'text-destructive'
        : 'text-primary'
  const statusLabel = stale ? 'stale' : sub.status
  const latencyLabel = sub.latencyMs > 0 ? `${sub.latencyMs}ms` : ''
  return (
    <li className='border-b border-border last:border-b-0'>
      <button
        className='flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50'
        onClick={() => setExpanded(v => !v)}
        type='button'>
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            sub.status === 'loaded'
              ? stale
                ? 'bg-destructive'
                : 'bg-primary'
              : sub.status === 'error'
                ? 'bg-destructive'
                : 'bg-primary'
          )}
        />
        <span className='min-w-0 flex-1 truncate font-mono text-foreground'>{sub.query}</span>
        {latencyLabel ? (
          <span className={cn('shrink-0 font-mono tabular-nums', slow ? 'text-foreground' : 'text-muted-foreground')}>
            {latencyLabel}
          </span>
        ) : null}
        <span className={cn('shrink-0 font-mono', statusColor)}>{statusLabel}</span>
        <span className='shrink-0 text-muted-foreground tabular-nums'>{sub.updateCount}x</span>
        <span className='shrink-0 text-muted-foreground/40'>{expanded ? '^' : 'v'}</span>
      </button>
      {expanded ? (
        <div className='space-y-1 bg-background/50 px-3 py-2 text-xs'>
          <p className='font-mono text-muted-foreground'>args: {sub.args}</p>
          {sub.dataPreview ? (
            <p className='max-h-32 overflow-y-auto font-mono break-all whitespace-pre-wrap text-muted-foreground'>
              {sub.dataPreview}...
            </p>
          ) : (
            <p className='font-mono text-muted-foreground'>No data yet</p>
          )}
        </div>
      ) : null}
    </li>
  )
}
const ReducerRow = ({ mutation }: { mutation: DevMutation }) => {
  const statusColor =
    mutation.status === 'success' ? 'text-primary' : mutation.status === 'error' ? 'text-destructive' : 'text-primary'
  const durationLabel = mutation.durationMs > 0 ? `${mutation.durationMs}ms` : 'pending'
  return (
    <li className='flex items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-b-0'>
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          mutation.status === 'success'
            ? 'bg-primary'
            : mutation.status === 'error'
              ? 'bg-destructive'
              : 'animate-pulse bg-primary'
        )}
      />
      <span className='shrink-0 pt-px font-mono text-muted-foreground'>{formatTime(mutation.startedAt)}</span>
      <span className='min-w-0 flex-1 truncate font-mono text-foreground'>{mutation.name}</span>
      <span className={cn('shrink-0 font-mono tabular-nums', statusColor)}>{durationLabel}</span>
    </li>
  )
}
const Devtools = ({
  buttonClassName,
  className,
  defaultOpen = false,
  defaultTab = 'errors',
  panelClassName,
  position = 'bottom-right'
}: DevtoolsProps = {}) => {
  const { cache, clear, clearMutations, connection, errors, mutations, subscriptions } = useDevErrors()
  const posClass = POSITION_CLASSES[position]
  const [open, setOpen] = useState(defaultOpen)
  const [tab, setTab] = useState<TabId>(defaultTab)
  const [showWaterfall, setShowWaterfall] = useState(false)
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') return null
  const errorCount = errors.length
  const subCount = subscriptions.length
  const reducerCount = mutations.length
  const cacheCount = cache.length
  const staleCount = subscriptions.filter(isStale).length
  const slowCount = subscriptions.filter(isSlow).length
  const pendingCount = mutations.filter(m => m.status === 'pending').length
  const count = errorCount
  const minStart = subscriptions.length > 0 ? Math.min(...subscriptions.map(s => s.startedAt)) : 0
  const connWarnCount = connection.isActive ? 0 : 1
  if (!open)
    return (
      <button
        className={cn(
          'fixed',
          posClass,
          'z-9999 flex size-10 items-center justify-center rounded-full shadow-lg transition-colors',
          count > 0 || connWarnCount > 0
            ? 'bg-destructive text-foreground hover:bg-destructive'
            : staleCount > 0 || pendingCount > 0
              ? 'bg-destructive text-foreground hover:bg-destructive'
              : 'bg-muted text-muted-foreground hover:bg-muted',
          className,
          buttonClassName
        )}
        onClick={() => setOpen(v => !v)}
        title='noboil DevTools'
        type='button'>
        {count > 0 ? (
          <span className='text-sm font-bold'>{count > MAX_BADGE ? `${MAX_BADGE}+` : count}</span>
        ) : pendingCount > 0 ? (
          <span className='text-sm font-bold'>{pendingCount}</span>
        ) : staleCount > 0 ? (
          <span className='text-sm font-bold'>{staleCount}</span>
        ) : connWarnCount > 0 ? (
          <span className='text-sm font-bold'>!</span>
        ) : (
          <span className='text-base'>S</span>
        )}
      </button>
    )
  return (
    <div
      className={cn(
        'fixed',
        posClass,
        'z-9999 flex w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl',
        className,
        panelClassName
      )}>
      <div className='flex items-center justify-between border-b border-border bg-background px-3 py-2'>
        <div className='flex gap-1'>
          <TabBtn
            active={tab === 'errors'}
            label={`Errors${errorCount > 0 ? ` (${errorCount})` : ''}`}
            onClick={() => setTab('errors')}
          />
          <TabBtn
            active={tab === 'subs'}
            label={`Subs${subCount > 0 ? ` (${subCount})` : ''}${staleCount > 0 ? ` . ${staleCount}!` : ''}${slowCount > 0 ? ` . ${slowCount}~` : ''}`}
            onClick={() => setTab('subs')}
          />
          <TabBtn
            active={tab === 'reducers'}
            label={`Reducers${reducerCount > 0 ? ` (${reducerCount})` : ''}${pendingCount > 0 ? ` . ${pendingCount}` : ''}`}
            onClick={() => setTab('reducers')}
          />
          <TabBtn
            active={tab === 'cache'}
            label={`Cache${cacheCount > 0 ? ` (${cacheCount})` : ''}`}
            onClick={() => setTab('cache')}
          />
        </div>
        <div className='flex gap-1'>
          {tab === 'errors' ? (
            <>
              <select
                className='rounded-sm bg-muted px-1 py-0.5 text-xs text-muted-foreground'
                onChange={e => {
                  const val = e.target.value
                  if (val in ERROR_MESSAGES) injectError(val as ErrorCode, { table: 'test' })
                  e.target.value = ''
                }}>
                <option value=''>Inject...</option>
                {Object.keys(ERROR_MESSAGES).map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {errorCount > 0 ? (
                <button
                  className='rounded-sm px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground'
                  onClick={clear}
                  type='button'>
                  Clear
                </button>
              ) : null}
            </>
          ) : null}
          {tab === 'reducers' && reducerCount > 0 ? (
            <button
              className='rounded-sm px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground'
              onClick={clearMutations}
              type='button'>
              Clear
            </button>
          ) : null}
          {tab === 'subs' && subCount > 0 ? (
            <button
              className='rounded-sm px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground'
              onClick={() => setShowWaterfall(v => !v)}
              type='button'>
              {showWaterfall ? 'List' : 'Waterfall'}
            </button>
          ) : null}
          <button
            className='rounded-sm px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground'
            onClick={() => setOpen(v => !v)}
            type='button'>
            x
          </button>
        </div>
      </div>
      <div className='border-b border-border bg-background/80 px-3 py-2'>
        <ConnectionBadge connection={connection} />
        {connection.connectionError ? (
          <p className='mt-1 line-clamp-2 text-xs text-destructive' title={connection.connectionError}>
            {connection.connectionError}
          </p>
        ) : null}
      </div>
      <div className='max-h-80 overflow-y-auto'>
        {tab === 'errors' ? (
          errorCount === 0 ? (
            <p className='px-3 py-6 text-center text-xs text-muted-foreground'>No errors</p>
          ) : (
            <ul>
              {errors.map(e => (
                <ErrorRow error={e} key={e.id} />
              ))}
            </ul>
          )
        ) : tab === 'subs' ? (
          subCount === 0 ? (
            <p className='px-3 py-6 text-center text-xs text-muted-foreground'>No active subscriptions</p>
          ) : showWaterfall ? (
            <ul>
              {subscriptions.map(s => (
                <WaterfallBar isSlow={isSlow} key={s.id} minStart={minStart} sub={s} />
              ))}
            </ul>
          ) : (
            <ul>
              {subscriptions.map(s => (
                <SubRow key={s.id} sub={s} />
              ))}
            </ul>
          )
        ) : tab === 'reducers' ? (
          reducerCount === 0 ? (
            <p className='px-3 py-6 text-center text-xs text-muted-foreground'>No reducer calls tracked</p>
          ) : (
            <ul>
              {mutations.map(m => (
                <ReducerRow key={m.id} mutation={m} />
              ))}
            </ul>
          )
        ) : cacheCount === 0 ? (
          <p className='px-3 py-6 text-center text-xs text-muted-foreground'>No cache entries</p>
        ) : (
          <ul>
            {cache.map(c => (
              <CacheRow entry={c} key={c.id} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
let autoMounted = false
/** Auto-mounts the devtools panel when the provider is active. */
const DevtoolsAutoMount = (props: DevtoolsProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') return
    if (autoMounted) return
    autoMounted = true
    const el = document.createElement('div')
    el.id = 'noboil-stdb-devtools-portal'
    document.body.append(el)
    containerRef.current = el
    setMounted(true)
    return () => {
      autoMounted = false
      el.remove()
    }
  }, [])
  if (!(mounted && containerRef.current)) return null
  return createPortal(<Devtools {...props} />, containerRef.current)
}
export default Devtools
export { Devtools, DevtoolsAutoMount }
export type { DevtoolsProps }
