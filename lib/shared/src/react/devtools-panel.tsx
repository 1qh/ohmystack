/* oxlint-disable jsx-no-new-object-as-prop */
/** biome-ignore-all lint/nursery/noInlineStyles: dynamic waterfall positioning */
'use client'
import { cn } from '@a/ui'
import { useEffect, useState } from 'react'
import type { DevCacheEntry, DevSubscription } from './devtools'
type Position = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
const POSITION_CLASSES: Record<Position, string> = {
  'bottom-left': 'left-4 bottom-4',
  'bottom-right': 'right-4 bottom-4',
  'top-left': 'left-4 top-4',
  'top-right': 'right-4 top-4'
}
const MAX_BADGE = 99
const WATERFALL_MAX_MS = 10_000
const formatTime = (ts: number) => {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const mn = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${mn}:${s}`
}
const TabBtn = ({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) => (
  <button
    className={cn(
      'rounded-sm px-2 py-0.5 text-xs',
      active ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-400 hover:text-zinc-200'
    )}
    onClick={onClick}
    type='button'>
    {label}
  </button>
)
const CacheRow = ({ entry }: { entry: DevCacheEntry }) => {
  const total = entry.hitCount + entry.missCount
  const hitRate = total > 0 ? Math.round((entry.hitCount / total) * 100) : 0
  return (
    <li className='flex items-center gap-2 border-b border-zinc-800 px-3 py-2 text-xs last:border-b-0'>
      <span className={cn('size-1.5 shrink-0 rounded-full', entry.stale ? 'bg-yellow-400' : 'bg-emerald-400')} />
      <span className='shrink-0 font-mono text-zinc-500'>{entry.table}</span>
      <span className='min-w-0 flex-1 truncate font-mono text-zinc-300'>{entry.key}</span>
      <span
        className={cn(
          'shrink-0 font-mono tabular-nums',
          hitRate > 80 ? 'text-emerald-400' : hitRate > 50 ? 'text-yellow-400' : 'text-red-400'
        )}>
        {hitRate}%
      </span>
      <span className='shrink-0 text-zinc-500 tabular-nums'>
        {entry.hitCount}h/{entry.missCount}m
      </span>
      {entry.stale ? <span className='shrink-0 font-mono text-yellow-400'>stale</span> : null}
    </li>
  )
}
const WaterfallBar = ({
  isSlow,
  minStart,
  sub
}: {
  isSlow: (sub: DevSubscription) => boolean
  minStart: number
  sub: DevSubscription
}) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (sub.latencyMs > 0 || now - sub.startedAt >= WATERFALL_MAX_MS) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [sub.latencyMs, sub.startedAt, now])
  const offset = sub.startedAt - minStart
  const duration = sub.latencyMs || now - sub.startedAt
  const leftPct = Math.min((offset / WATERFALL_MAX_MS) * 100, 100)
  const widthPct = Math.max(Math.min((duration / WATERFALL_MAX_MS) * 100, 100 - leftPct), 1)
  const barColor =
    sub.status === 'loaded'
      ? isSlow(sub)
        ? 'bg-orange-500'
        : 'bg-emerald-500'
      : sub.status === 'error'
        ? 'bg-red-500'
        : 'bg-blue-500'
  return (
    <li className='flex items-center gap-2 border-b border-zinc-800 px-2 py-1.5 text-xs last:border-b-0'>
      <span className='w-28 shrink-0 truncate font-mono text-zinc-400'>{sub.query}</span>
      <span className='relative h-3 min-w-0 flex-1 rounded-sm bg-zinc-800/50'>
        <span
          className={cn('absolute top-0 h-full rounded-sm', barColor)}
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
      </span>
      <span className='w-12 shrink-0 text-right font-mono text-zinc-500 tabular-nums'>
        {sub.latencyMs > 0 ? `${sub.latencyMs}ms` : '...'}
      </span>
    </li>
  )
}
export { CacheRow, formatTime, MAX_BADGE, POSITION_CLASSES, TabBtn, WATERFALL_MAX_MS, WaterfallBar }
export type { DevCacheEntry, DevSubscription, Position }
