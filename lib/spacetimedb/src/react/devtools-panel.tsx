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
  const dotClass = connection.isActive ? 'bg-emerald-400' : 'bg-red-400'
  const status = connection.isActive ? 'connected' : 'disconnected'
  return (
    <div className='flex items-center gap-2 rounded-sm bg-zinc-900/80 px-2 py-1 text-xs'>
      <span className={cn('size-1.5 rounded-full', dotClass)} />
      <span className='font-mono text-zinc-300'>{status}</span>
      {connection.connectionId ? (
        <span className='max-w-20 truncate font-mono text-zinc-500' title={connection.connectionId}>
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
    <li className='border-b border-red-900/30 last:border-b-0'>
      <button
        className='flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-red-950/30'
        onClick={() => setExpanded(v => !v)}
        type='button'>
        <span className='shrink-0 pt-px font-mono text-red-400/60'>{formatTime(error.timestamp)}</span>
        {code ? <span className='shrink-0 rounded-sm bg-red-900/50 px-1 font-mono text-red-300'>{code}</span> : null}
        <span className='min-w-0 flex-1 truncate text-red-200'>{error.message}</span>
        <span className='shrink-0 text-red-400/40'>{expanded ? '^' : 'v'}</span>
      </button>
      {expanded ? (
        <div className='space-y-1 bg-red-950/20 px-3 py-2 text-xs'>
          {table || op ? (
            <p className='font-mono text-red-400/80'>
              {table ? `table: ${table}` : ''}
              {table && op ? ' . ' : ''}
              {op ? `op: ${op}` : ''}
            </p>
          ) : null}
          <p className='break-all whitespace-pre-wrap text-red-300/90'>{error.detail}</p>
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
        ? 'text-yellow-400'
        : 'text-emerald-400'
      : sub.status === 'error'
        ? 'text-red-400'
        : 'text-blue-400'
  const statusLabel = stale ? 'stale' : sub.status
  const latencyLabel = sub.latencyMs > 0 ? `${sub.latencyMs}ms` : ''
  return (
    <li className='border-b border-zinc-800 last:border-b-0'>
      <button
        className='flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-zinc-800/50'
        onClick={() => setExpanded(v => !v)}
        type='button'>
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            sub.status === 'loaded'
              ? stale
                ? 'bg-yellow-400'
                : 'bg-emerald-400'
              : sub.status === 'error'
                ? 'bg-red-400'
                : 'bg-blue-400'
          )}
        />
        <span className='min-w-0 flex-1 truncate font-mono text-zinc-300'>{sub.query}</span>
        {latencyLabel ? (
          <span className={cn('shrink-0 font-mono tabular-nums', slow ? 'text-orange-400' : 'text-zinc-500')}>
            {latencyLabel}
          </span>
        ) : null}
        <span className={cn('shrink-0 font-mono', statusColor)}>{statusLabel}</span>
        <span className='shrink-0 text-zinc-500 tabular-nums'>{sub.updateCount}x</span>
        <span className='shrink-0 text-zinc-500/40'>{expanded ? '^' : 'v'}</span>
      </button>
      {expanded ? (
        <div className='space-y-1 bg-zinc-900/50 px-3 py-2 text-xs'>
          <p className='font-mono text-zinc-500'>args: {sub.args}</p>
          {sub.dataPreview ? (
            <p className='max-h-32 overflow-y-auto font-mono break-all whitespace-pre-wrap text-zinc-400'>
              {sub.dataPreview}...
            </p>
          ) : (
            <p className='font-mono text-zinc-600'>No data yet</p>
          )}
        </div>
      ) : null}
    </li>
  )
}
const ReducerRow = ({ mutation }: { mutation: DevMutation }) => {
  const statusColor =
    mutation.status === 'success' ? 'text-emerald-400' : mutation.status === 'error' ? 'text-red-400' : 'text-blue-400'
  const durationLabel = mutation.durationMs > 0 ? `${mutation.durationMs}ms` : 'pending'
  return (
    <li className='flex items-center gap-2 border-b border-zinc-800 px-3 py-2 text-xs last:border-b-0'>
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          mutation.status === 'success'
            ? 'bg-emerald-400'
            : mutation.status === 'error'
              ? 'bg-red-400'
              : 'animate-pulse bg-blue-400'
        )}
      />
      <span className='shrink-0 pt-px font-mono text-zinc-500'>{formatTime(mutation.startedAt)}</span>
      <span className='min-w-0 flex-1 truncate font-mono text-zinc-300'>{mutation.name}</span>
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
            ? 'bg-red-600 text-white hover:bg-red-700'
            : staleCount > 0 || pendingCount > 0
              ? 'bg-yellow-600 text-white hover:bg-yellow-700'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700',
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
        'z-9999 flex w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl',
        className,
        panelClassName
      )}>
      <div className='flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 py-2'>
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
                className='rounded-sm bg-zinc-800 px-1 py-0.5 text-xs text-zinc-400'
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
                  className='rounded-sm px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  onClick={clear}
                  type='button'>
                  Clear
                </button>
              ) : null}
            </>
          ) : null}
          {tab === 'reducers' && reducerCount > 0 ? (
            <button
              className='rounded-sm px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              onClick={clearMutations}
              type='button'>
              Clear
            </button>
          ) : null}
          {tab === 'subs' && subCount > 0 ? (
            <button
              className='rounded-sm px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              onClick={() => setShowWaterfall(v => !v)}
              type='button'>
              {showWaterfall ? 'List' : 'Waterfall'}
            </button>
          ) : null}
          <button
            className='rounded-sm px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            onClick={() => setOpen(v => !v)}
            type='button'>
            x
          </button>
        </div>
      </div>
      <div className='border-b border-zinc-900 bg-zinc-950/80 px-3 py-2'>
        <ConnectionBadge connection={connection} />
        {connection.connectionError ? (
          <p className='mt-1 line-clamp-2 text-xs text-red-300' title={connection.connectionError}>
            {connection.connectionError}
          </p>
        ) : null}
      </div>
      <div className='max-h-80 overflow-y-auto'>
        {tab === 'errors' ? (
          errorCount === 0 ? (
            <p className='px-3 py-6 text-center text-xs text-zinc-500'>No errors</p>
          ) : (
            <ul>
              {errors.map(e => (
                <ErrorRow error={e} key={e.id} />
              ))}
            </ul>
          )
        ) : tab === 'subs' ? (
          subCount === 0 ? (
            <p className='px-3 py-6 text-center text-xs text-zinc-500'>No active subscriptions</p>
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
            <p className='px-3 py-6 text-center text-xs text-zinc-500'>No reducer calls tracked</p>
          ) : (
            <ul>
              {mutations.map(m => (
                <ReducerRow key={m.id} mutation={m} />
              ))}
            </ul>
          )
        ) : cacheCount === 0 ? (
          <p className='px-3 py-6 text-center text-xs text-zinc-500'>No cache entries</p>
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
