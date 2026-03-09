/* eslint-disable complexity, react-hooks/refs */
/* oxlint-disable eslint/complexity */
'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { DevCacheEntry, DevError, DevMutation, DevSubscription } from './devtools'

import { SLOW_THRESHOLD_MS, STALE_THRESHOLD_MS, useDevErrors } from './devtools'

  buttonClassName?: string
  defaultOpen?: boolean
  panelClassName?: string
  LazyConvexDevtools = ({
    buttonClassName,
    className,
    defaultOpen = false,
    defaultTab = 'errors',
    panelClassName,
    position = 'bottom-right'
  }: DevtoolsProps = {}) => {
    const { cache, clear, clearMutations, errors, mutations, subscriptions } = useDevErrors(),
      posClass = POSITION_CLASSES[position],
      [open, setOpen] = useState(defaultOpen),
      [tab, setTab] = useState<TabId>(defaultTab),
      [showWaterfall, setShowWaterfall] = useState(false)

    // biome-ignore lint/style/noProcessEnv: env detection
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') return null

    const errorCount = errors.length,
      subCount = subscriptions.length,
      mutCount = mutations.length,
      cacheCount = cache.length,
      staleCount = subscriptions.filter(isStale).length,
      slowCount = subscriptions.filter(isSlow).length,
      pendingCount = mutations.filter(m => m.status === 'pending').length,
      count = errorCount,
      minStart = subscriptions.length > 0 ? Math.min(...subscriptions.map(s => s.startedAt)) : 0
    if (!open)
      return (
        <button
          className={`fixed ${posClass} z-9999 flex size-10 items-center justify-center rounded-full shadow-lg transition-colors ${count > 0 ? 'bg-red-600 text-white hover:bg-red-700' : staleCount > 0 || pendingCount > 0 ? 'bg-yellow-600 text-white hover:bg-yellow-700' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'} ${className ?? ''} ${buttonClassName ?? ''}`}
          onClick={() => setOpen(v => !v)}
          title='LazyConvex DevTools'
          type='button'>
          {count > 0 ? (
            <span className='text-sm font-bold'>{count > MAX_BADGE ? `${MAX_BADGE}+` : String(count)}</span>
          ) : pendingCount > 0 ? (
            <span className='text-sm font-bold'>{pendingCount}</span>
          ) : staleCount > 0 ? (
            <span className='text-sm font-bold'>{staleCount}</span>
          ) : (
            <span className='text-base'>⚡</span>
          )}
        </button>
      )

    return (
      <div
        className={`fixed ${posClass} z-9999 flex w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl ${className ?? ''} ${panelClassName ?? ''}`}>
        <div className='flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 py-2'>
          <div className='flex gap-1'>
            <TabBtn
              active={tab === 'errors'}
              label={`Errors${errorCount > 0 ? ` (${errorCount})` : ''}`}
              onClick={() => setTab('errors')}
            />
            <TabBtn
              active={tab === 'subs'}
              label={`Subs${subCount > 0 ? ` (${subCount})` : ''}${staleCount > 0 ? ` \u00B7 ${staleCount}\u26A0` : ''}${slowCount > 0 ? ` \u00B7 ${slowCount}\u{1F422}` : ''}`}
              onClick={() => setTab('subs')}
            />
            <TabBtn
              active={tab === 'mutations'}
              label={`Mut${mutCount > 0 ? ` (${mutCount})` : ''}${pendingCount > 0 ? ` \u00B7 ${pendingCount}\u23F3` : ''}`}
              onClick={() => setTab('mutations')}
            />
            <TabBtn
              active={tab === 'cache'}
              label={`Cache${cacheCount > 0 ? ` (${cacheCount})` : ''}`}
              onClick={() => setTab('cache')}
            />
          </div>
          <div className='flex gap-1'>
            {tab === 'errors' && errorCount > 0 ? (
              <button
                className='rounded-sm px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                onClick={clear}
                type='button'>
                Clear
              </button>
            ) : null}
            {tab === 'mutations' && mutCount > 0 ? (
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
              ✕
            </button>
          </div>
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
                  <WaterfallBar key={s.id} minStart={minStart} sub={s} />
                ))}
              </ul>
            ) : (
              <ul>
                {subscriptions.map(s => (
                  <SubRow key={s.id} sub={s} />
                ))}
              </ul>
            )
          ) : tab === 'mutations' ? (
            mutCount === 0 ? (
              <p className='px-3 py-6 text-center text-xs text-zinc-500'>No mutations tracked</p>
            ) : (
              <ul>
                {mutations.map(m => (
                  <MutationRow key={m.id} mutation={m} />
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

const DevtoolsAutoMount = (props: DevtoolsProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null),
    [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (typeof document === 'undefined') return
    // biome-ignore lint/style/noProcessEnv: env detection
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') return
    if (autoMounted) return
    autoMounted = true
    const el = document.createElement('div')
    el.id = 'ohmystack-convex-devtools-portal'
    document.body.append(el)
    containerRef.current = el
    setMounted(true)
    return () => {
      autoMounted = false
      el.remove()
    }
  }, [])

  if (!(mounted && containerRef.current)) return null
  return createPortal(<LazyConvexDevtools {...props} />, containerRef.current)
}

export default LazyConvexDevtools
export { DevtoolsAutoMount }
export type { DevtoolsProps }
