/** biome-ignore-all lint/suspicious/noArrayIndexKey: scrolled window */
/* oxlint-disable eslint-plugin-react(no-array-index-key), no-promise-executor-return, eslint-plugin-promise(param-names), typescript-eslint(strict-void-return), typescript-eslint(no-unnecessary-condition), eslint-plugin-promise(prefer-await-to-then), react-web-api(no-leaked-timeout), eslint(require-await), eslint(complexity) */
/* eslint-disable react/no-array-index-key, @eslint-react/no-array-index-key, complexity */
import { Box, render, Text, useApp, useInput } from 'ink'
import Spinner from 'ink-spinner'
import { useEffect, useMemo, useState } from 'react'
interface SyncAction {
  kind: 'added' | 'review' | 'skipped' | 'updated'
  relPath: string
}
interface SyncProgress {
  actions: SyncAction[]
  current: string
  error?: string
  fromHash: string
  phase: 'cloning' | 'comparing' | 'done' | 'error' | 'processing' | 'ready'
  toHash: string
  total: number
}
const Row = ({ action }: { action: SyncAction }) => {
  const iconMap = { added: '+', review: '!', skipped: '·', updated: '~' }
  const colorMap = { added: 'green', review: 'yellow', skipped: undefined, updated: 'cyan' } as const
  return (
    <Box>
      <Box marginRight={1} width={2}>
        <Text color={colorMap[action.kind]}>{iconMap[action.kind]}</Text>
      </Box>
      <Text dimColor={action.kind === 'skipped'}>{action.relPath}</Text>
      {action.kind === 'review' ? <Text dimColor> (review manually)</Text> : null}
      {action.kind === 'skipped' ? <Text dimColor> (modified locally)</Text> : null}
    </Box>
  )
}
interface SyncOpts {
  dryRun: boolean
  force: boolean
}
type SyncRun = (opts: SyncOpts, onProgress: (p: Partial<SyncProgress>) => void) => Promise<void>
const SyncApp = ({
  dryRun,
  force,
  onExit,
  run
}: {
  dryRun: boolean
  force: boolean
  onExit: (code: number) => void
  run: SyncRun
}) => {
  const app = useApp()
  const [progress, setProgress] = useState<SyncProgress>({
    actions: [],
    current: '',
    fromHash: '',
    phase: 'ready',
    toHash: '',
    total: 0
  })
  useEffect(() => {
    const start = async () => {
      try {
        await run({ dryRun, force }, patch => {
          setProgress(p => ({ ...p, ...patch, actions: patch.actions ?? p.actions }))
        })
      } catch (error) {
        setProgress(p => ({ ...p, error: error instanceof Error ? error.message : String(error), phase: 'error' }))
      }
    }
    start().catch(() => null)
  }, [dryRun, force, run])
  useEffect(() => {
    if (progress.phase === 'done' || progress.phase === 'error') {
      const t = setTimeout(() => {
        app.exit()
        onExit(progress.phase === 'error' ? 1 : 0)
      }, 200)
      return () => clearTimeout(t)
    }
  }, [progress.phase, app, onExit])
  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      app.exit()
      onExit(1)
    }
  })
  const { actions } = progress
  const updated = actions.filter(a => a.kind === 'updated').length
  const added = actions.filter(a => a.kind === 'added').length
  const skipped = actions.filter(a => a.kind === 'skipped').length
  const review = actions.filter(a => a.kind === 'review').length
  const recent = actions.slice(-12)
  const startTime = useMemo(() => Date.now(), [])
  const processed = actions.length
  const pct = progress.total > 0 ? Math.floor((processed / progress.total) * 100) : 0
  const elapsedMs = Date.now() - startTime
  const etaMs = processed > 0 && progress.total > processed ? ((progress.total - processed) * elapsedMs) / processed : 0
  const etaSec = Math.ceil(etaMs / 1000)
  return (
    <Box flexDirection='column' padding={1}>
      <Box flexDirection='column' marginBottom={1}>
        <Text bold color='cyan'>
          noboil sync
        </Text>
        <Text dimColor>
          pull upstream changes {dryRun ? '(dry-run)' : ''} {force ? '(force)' : ''}
        </Text>
      </Box>
      {progress.phase === 'cloning' ? (
        <Box>
          <Text color='cyan'>
            <Spinner type='dots' />
          </Text>
          <Text> cloning upstream...</Text>
        </Box>
      ) : null}
      {progress.phase === 'comparing' ? (
        <Box>
          <Text color='cyan'>
            <Spinner type='dots' />
          </Text>
          <Text> comparing files...</Text>
        </Box>
      ) : null}
      {progress.phase === 'processing' ? (
        <Box flexDirection='column'>
          <Box>
            <Text color='cyan'>
              <Spinner type='dots' />
            </Text>
            <Text>
              {' '}
              {processed}/{progress.total} ({pct}%){etaMs > 0 ? ` · eta ${etaSec}s` : ''} ·{' '}
              {progress.current || 'processing'}
            </Text>
          </Box>
          {recent.length > 0 ? (
            <Box flexDirection='column' marginTop={1}>
              {recent.map((a, i) => (
                <Row action={a} key={`${a.relPath}-${i}`} />
              ))}
            </Box>
          ) : null}
        </Box>
      ) : null}
      {progress.phase === 'done' ? (
        <Box flexDirection='column'>
          <Box gap={2}>
            {updated > 0 ? <Text color='cyan'>{updated} updated</Text> : null}
            {added > 0 ? <Text color='green'>{added} added</Text> : null}
            {skipped > 0 ? <Text dimColor>{skipped} skipped</Text> : null}
            {review > 0 ? <Text color='yellow'>{review} review</Text> : null}
            {updated + added + skipped + review === 0 ? <Text color='green'>Already up to date.</Text> : null}
          </Box>
          {actions.length > 0 ? (
            <Box flexDirection='column' marginTop={1}>
              {actions.map((a, i) => (
                <Row action={a} key={`${a.relPath}-${i}`} />
              ))}
            </Box>
          ) : null}
          {progress.fromHash && progress.toHash ? (
            <Box marginTop={1}>
              <Text dimColor>
                {progress.fromHash.slice(0, 7)} → {progress.toHash.slice(0, 7)}
              </Text>
            </Box>
          ) : null}
          <Box marginTop={1}>
            <Text color={dryRun ? 'yellow' : 'green'}>{dryRun ? 'No files were written.' : 'Sync complete.'}</Text>
          </Box>
        </Box>
      ) : null}
      {progress.phase === 'error' ? (
        <Box marginTop={1}>
          <Text color='red'>Error: {progress.error}</Text>
        </Box>
      ) : null}
    </Box>
  )
}
const runSyncTui = async ({ dryRun, force, run }: { dryRun: boolean; force: boolean; run: SyncRun }): Promise<number> =>
  new Promise(resolve => {
    const { unmount } = render(<SyncApp dryRun={dryRun} force={force} onExit={resolve} run={run} />)
    process.on('SIGINT', () => {
      unmount()
      resolve(1)
    })
  })
export type { SyncAction, SyncProgress, SyncRun }
export { runSyncTui }
