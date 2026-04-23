/** biome-ignore-all lint/style/noNonNullAssertion: bounded array access */
/* oxlint-disable typescript-eslint(no-non-null-assertion), no-promise-executor-return, eslint-plugin-promise(param-names), eslint-plugin-react(no-unnecessary-use-memo), eslint-plugin-promise(prefer-await-to-then), react-web-api(no-leaked-timeout), typescript-eslint(strict-void-return), typescript-eslint(no-unnecessary-type-conversion) */
/* eslint-disable @eslint-react/no-unnecessary-use-memo, @eslint-react/web-api/no-leaked-timeout, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-conversion, @typescript-eslint/strict-void-return, no-promise-executor-return */
import { env } from 'bun'
import { Box, render, Text, useApp, useInput } from 'ink'
import Spinner from 'ink-spinner'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Db } from './scaffold-ops'
import { patchRootPackageJson, patchTsconfig, patchWorkspacePackageJsons, pruneLibFe, removeDirs } from './scaffold-ops'
interface DbChoice {
  desc: string
  label: string
  value: Db
}
interface InitFlags {
  db?: Db
  defaultDb?: Db
  dir?: string
  includeDemos?: boolean
  skipInstall: boolean
}
const DBS: DbChoice[] = [
  { desc: 'hosted, reactive queries, server functions', label: 'Convex', value: 'convex' },
  { desc: 'self-hosted, subscriptions, Rust module', label: 'SpacetimeDB', value: 'spacetimedb' }
]
const DEFAULT_REPO_URL = 'https://github.com/1qh/noboil'
const REPO_SPEC = env.NOBOIL_REPO ?? DEFAULT_REPO_URL
const REPO_GIT_URL =
  REPO_SPEC.startsWith('/') || REPO_SPEC.startsWith('file://')
    ? REPO_SPEC
    : REPO_SPEC.endsWith('.git')
      ? REPO_SPEC
      : `${REPO_SPEC}.git`
const SCAFFOLD_STEPS = [
  'downloading repo',
  'reading commit hash',
  'removing unused files',
  'patching root package.json',
  'pruning lib/fe',
  'patching workspace packages',
  'patching tsconfig',
  'installing dependencies',
  'writing manifest'
] as const
type Phase = 'confirm' | 'demos' | 'dir' | 'pick-db' | 'scaffold'
interface ScaffoldState {
  currentStep: number
  details: string[]
  error?: string
  status: StepStatus
}
type StepStatus = 'done' | 'failed' | 'idle' | 'running'
const Header = () => (
  <Box flexDirection='column' marginBottom={1}>
    <Text bold color='cyan'>
      noboil
    </Text>
    <Text dimColor>schema-first, zero-boilerplate fullstack</Text>
  </Box>
)
const PickDb = ({ onPick, selected }: { onPick: (db: Db) => void; selected: number }) => {
  const [idx, setIdx] = useState(selected)
  useInput((input, key) => {
    if (key.upArrow || input === 'k') setIdx(i => (i === 0 ? DBS.length - 1 : i - 1))
    else if (key.downArrow || input === 'j') setIdx(i => (i === DBS.length - 1 ? 0 : i + 1))
    else if (key.return) onPick(DBS[idx]!.value)
    else if (input === '1') onPick(DBS[0]!.value)
    else if (input === '2') onPick(DBS[1]!.value)
  })
  return (
    <Box flexDirection='column'>
      <Text bold>Pick your database</Text>
      <Box flexDirection='column' marginTop={1}>
        {DBS.map((db, i) => (
          <Box key={db.value}>
            <Text color={i === idx ? 'cyan' : undefined}>{i === idx ? '› ' : '  '}</Text>
            <Text bold={i === idx} color={i === idx ? 'cyan' : undefined}>
              {db.label.padEnd(13)}
            </Text>
            <Text dimColor>{db.desc}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓/jk select · ↵ confirm · 1/2 quick</Text>
      </Box>
    </Box>
  )
}
const Toggle = ({
  hint,
  initial,
  label,
  onConfirm
}: {
  hint: string
  initial: boolean
  label: string
  onConfirm: (v: boolean) => void
}) => {
  const [value, setValue] = useState(initial)
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') onConfirm(true)
    else if (input === 'n' || input === 'N') onConfirm(false)
    else if (key.leftArrow || key.rightArrow || input === ' ') setValue(v => !v)
    else if (key.return) onConfirm(value)
  })
  return (
    <Box flexDirection='column'>
      <Text bold>{label}</Text>
      <Box marginTop={1}>
        <Text color={value ? 'green' : undefined}>{value ? '[ yes ] ' : '  yes  '}</Text>
        <Text dimColor> / </Text>
        <Text color={value ? undefined : 'yellow'}>{value ? '  no   ' : '[ no  ]'}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{hint}</Text>
      </Box>
    </Box>
  )
}
const DirInput = ({ defaultDir, onConfirm }: { defaultDir: string; onConfirm: (v: string) => void }) => {
  const [value, setValue] = useState('')
  useInput((input, key) => {
    if (key.return) onConfirm(value.trim() || defaultDir)
    else if (key.backspace || key.delete) setValue(v => v.slice(0, -1))
    else if (input && !key.ctrl && !key.meta) setValue(v => v + input)
  })
  return (
    <Box flexDirection='column'>
      <Text bold>Project directory</Text>
      <Box marginTop={1}>
        <Text color='cyan'>› </Text>
        <Text>{value || <Text dimColor>{defaultDir}</Text>}</Text>
        <Text color='cyan'>_</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↵ confirm · empty → {defaultDir}</Text>
      </Box>
    </Box>
  )
}
const Scaffold = ({
  db,
  dir,
  includeDemos,
  onDone,
  skipInstall
}: {
  db: Db
  dir: string
  includeDemos: boolean
  onDone: (state: ScaffoldState) => void
  skipInstall: boolean
}) => {
  const [state, setState] = useState<ScaffoldState>({ currentStep: 0, details: [], status: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const isDirNotEmptyError = state.status === 'failed' && state.error?.startsWith('directory')
  useInput((input, key) => {
    if (state.status !== 'failed') return
    if (input === 'r' || input === 'R') {
      setState({ currentStep: 0, details: [], status: 'idle' })
      setAttempt(a => a + 1)
    } else if (isDirNotEmptyError && (input === 'o' || input === 'O')) {
      const fullPath = resolvePath(process.cwd(), dir)
      rmSync(fullPath, { force: true, recursive: true })
      setState({ currentStep: 0, details: ['  overwritten existing directory'], status: 'idle' })
      setAttempt(a => a + 1)
    } else if (input === 'q' || input === 'Q' || key.escape) onDone(state)
  })
  /** biome-ignore lint/correctness/useExhaustiveDependencies: attempt is an intentional retry trigger */
  useEffect(() => {
    const run = async () => {
      await new Promise(r => setTimeout(r, 50))
      const fullPath = resolvePath(process.cwd(), dir)
      if (existsSync(fullPath) && readdirSync(fullPath).length > 0) {
        setState(s => ({ ...s, error: `directory ${dir} is not empty`, status: 'failed' }))
        return
      }
      const step = (n: number, msg?: string): void => {
        setState(s => ({
          ...s,
          currentStep: n,
          details: msg ? [...s.details, msg] : s.details,
          status: 'running'
        }))
      }
      try {
        step(0)
        if (REPO_SPEC.startsWith('/') || REPO_SPEC.startsWith('file://')) {
          spawnSync('git', ['clone', '--depth', '1', REPO_GIT_URL, fullPath], { stdio: 'pipe' })
          rmSync(join(fullPath, '.git'), { force: true, recursive: true })
        } else spawnSync('bunx', ['-y', 'gitpick', REPO_SPEC, fullPath, '--overwrite'], { stdio: 'pipe' })
        step(1)
        const revResult = spawnSync('git', ['ls-remote', REPO_GIT_URL, 'HEAD'], { encoding: 'utf8' })
        const scaffoldedFrom = (revResult.stdout.split('\n')[0] ?? '').split('\t')[0] ?? ''
        step(2)
        const removed = removeDirs({ db, dir: fullPath, includeDemos })
        if (removed.length > 0) setState(s => ({ ...s, details: [...s.details, `  ${removed.length} paths removed`] }))
        step(3)
        patchRootPackageJson({ db, dir: fullPath, includeDemos })
        step(4)
        pruneLibFe({ db, dir: fullPath })
        step(5)
        patchWorkspacePackageJsons({ db, dir: fullPath })
        step(6)
        patchTsconfig({ db, dir: fullPath })
        step(7)
        if (skipInstall) setState(s => ({ ...s, details: [...s.details, '  skipped (--skip-install)'] }))
        else {
          const installResult = spawnSync('bun', ['install'], { cwd: fullPath, stdio: 'pipe' })
          if (installResult.status !== 0)
            setState(s => ({ ...s, details: [...s.details, '  bun install failed — run manually later'] }))
        }
        step(8)
        const manifest = {
          db,
          includeDemos,
          scaffoldedAt: new Date().toISOString(),
          scaffoldedFrom,
          version: 1
        }
        writeFileSync(join(fullPath, '.noboilrc.json'), `${JSON.stringify(manifest, null, 2)}\n`)
        const { writeState } = await import('./shared/state')
        await writeState({ lastDb: db }).catch(() => null)
        setState(s => ({ ...s, currentStep: SCAFFOLD_STEPS.length, status: 'done' }))
      } catch (error) {
        setState(s => ({ ...s, error: error instanceof Error ? error.message : String(error), status: 'failed' }))
      }
    }
    run().catch(() => null)
  }, [db, dir, includeDemos, skipInstall, attempt])
  useEffect(() => {
    if (state.status === 'done') {
      const t = setTimeout(() => onDone(state), 300)
      return () => clearTimeout(t)
    }
  }, [state, onDone])
  const allSteps = useMemo(() => [...SCAFFOLD_STEPS], [])
  return (
    <Box flexDirection='column'>
      <Text bold>Creating project at {dir}</Text>
      <Box flexDirection='column' marginTop={1}>
        {allSteps.map((label, i) => {
          const isCurrent = i === state.currentStep && state.status === 'running'
          const isDone = i < state.currentStep || (i === state.currentStep && state.status === 'done')
          const isFailed = i === state.currentStep && state.status === 'failed'
          const icon = isFailed ? (
            <Text color='red'>✘</Text>
          ) : isDone ? (
            <Text color='green'>✔</Text>
          ) : isCurrent ? (
            <Text color='cyan'>
              <Spinner type='dots' />
            </Text>
          ) : (
            <Text dimColor>·</Text>
          )
          return (
            <Box key={label}>
              <Box marginRight={1}>{icon}</Box>
              <Text
                color={isCurrent ? 'cyan' : isDone ? 'green' : isFailed ? 'red' : undefined}
                dimColor={!(isCurrent || isDone || isFailed)}>
                {label}
              </Text>
            </Box>
          )
        })}
      </Box>
      {state.details.length > 0 ? (
        <Box flexDirection='column' marginTop={1}>
          {state.details.map(d => (
            <Text dimColor key={d}>
              {d}
            </Text>
          ))}
        </Box>
      ) : null}
      {state.error ? (
        <Box flexDirection='column' marginTop={1}>
          <Text color='red'>Error: {state.error}</Text>
          <Text dimColor>{isDirNotEmptyError ? 'r retry · o overwrite · q quit' : 'r retry · q quit'}</Text>
        </Box>
      ) : null}
    </Box>
  )
}
const InitApp = ({ onExit, ...flags }: InitFlags & { onExit: (result: { dir: string; success: boolean }) => void }) => {
  const app = useApp()
  const [db, setDb] = useState<Db | undefined>(flags.db)
  const [includeDemos, setIncludeDemos] = useState<boolean | undefined>(flags.includeDemos)
  const [dir, setDir] = useState<string | undefined>(flags.dir)
  const [phase, setPhase] = useState<Phase>(() => {
    if (!flags.db) return 'pick-db'
    if (flags.includeDemos === undefined) return 'demos'
    if (!flags.dir) return 'dir'
    return 'scaffold'
  })
  const [result, setResult] = useState<null | ScaffoldState>(null)
  const handleDbPick = useCallback(
    (picked: Db) => {
      setDb(picked)
      if (includeDemos === undefined) setPhase('demos')
      else if (dir) setPhase('scaffold')
      else setPhase('dir')
    },
    [dir, includeDemos]
  )
  const handleDemos = useCallback(
    (v: boolean) => {
      setIncludeDemos(v)
      if (dir) setPhase('scaffold')
      else setPhase('dir')
    },
    [dir]
  )
  const handleDir = useCallback((v: string) => {
    setDir(v)
    setPhase('scaffold')
  }, [])
  const handleScaffoldDone = useCallback(
    (s: ScaffoldState) => {
      setResult(s)
      setTimeout(() => {
        app.exit()
        onExit({ dir: dir ?? 'my-app', success: s.status === 'done' })
      }, 500)
    },
    [app, dir, onExit]
  )
  return (
    <Box flexDirection='column' padding={1}>
      <Header />
      {phase === 'pick-db' ? <PickDb onPick={handleDbPick} selected={flags.defaultDb === 'spacetimedb' ? 1 : 0} /> : null}
      {phase === 'demos' ? (
        <Toggle hint='y/n · space toggle · ↵ confirm' initial label='Include demo apps?' onConfirm={handleDemos} />
      ) : null}
      {phase === 'dir' ? <DirInput defaultDir='my-app' onConfirm={handleDir} /> : null}
      {phase === 'scaffold' && db && dir && includeDemos !== undefined ? (
        <Scaffold
          db={db}
          dir={dir}
          includeDemos={includeDemos}
          onDone={handleScaffoldDone}
          skipInstall={Boolean(flags.skipInstall)}
        />
      ) : null}
      {result?.status === 'done' ? (
        <Box flexDirection='column' marginTop={1}>
          <Text color='green'>Done!</Text>
          <Text dimColor>
            $ cd {dir} · {db === 'convex' ? 'bunx convex dev' : 'docker compose up -d'} · bun dev
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}
const runInitTui = async (flags: InitFlags): Promise<{ dir: string; success: boolean }> =>
  new Promise(resolve => {
    const { unmount } = render(<InitApp {...flags} onExit={resolve} />)
    process.on('SIGINT', () => {
      unmount()
      resolve({ dir: flags.dir ?? 'my-app', success: false })
    })
  })
export { runInitTui }
export type { InitFlags }
