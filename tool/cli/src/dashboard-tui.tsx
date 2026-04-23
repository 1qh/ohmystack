/* oxlint-disable no-promise-executor-return, eslint-plugin-promise(param-names), typescript-eslint(strict-void-return), eslint-plugin-promise(prefer-await-to-then), eslint(complexity) */
/* eslint-disable complexity */
import { Box, render, Text, useApp, useInput } from 'ink'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useEffect, useState } from 'react'
import type { RecentEntry } from './shared/recent'
import { readRecent } from './shared/recent'
import { checkForUpdate } from './shared/update-check'
import { getCliVersion } from './shared/version'
type Action = 'add' | 'completions' | 'doctor' | 'eject' | 'exit' | 'init' | 'status' | 'sync' | 'upgrade'
interface DashboardProps {
  cwd: string
  manifest: Manifest | null
  onExit: (action: Action) => void
  version: string
}
interface Manifest {
  db: string
  includeDemos: boolean
  scaffoldedAt: string
  scaffoldedFrom: string
  version: number
}
const PRINTABLE_KEY = /[\da-z]/iu
const COMMANDS: { action: Action; desc: string; key: string; name: string }[] = [
  { action: 'init', desc: 'Create a new noboil project', key: 'i', name: 'init' },
  { action: 'status', desc: 'Project snapshot (drift, sync age, health)', key: 't', name: 'status' },
  { action: 'doctor', desc: 'Check project health', key: 'd', name: 'doctor' },
  { action: 'sync', desc: 'Pull upstream changes', key: 's', name: 'sync' },
  { action: 'add', desc: 'Add a table (auto-detects DB)', key: 'a', name: 'add' },
  { action: 'eject', desc: 'Detach from upstream', key: 'e', name: 'eject' },
  { action: 'upgrade', desc: 'Upgrade noboil to latest', key: 'u', name: 'upgrade' },
  { action: 'completions', desc: 'Print shell completion script', key: 'c', name: 'completions' }
]
const DashboardApp = ({ cwd, manifest, onExit, version }: DashboardProps) => {
  const app = useApp()
  const [latest, setLatest] = useState<null | string>(null)
  const [recent, setRecent] = useState<RecentEntry[]>([])
  useEffect(() => {
    const run = async () => {
      try {
        setLatest(await checkForUpdate(version))
      } catch {
        setLatest(null)
      }
      try {
        setRecent((await readRecent()).slice(0, 3))
      } catch {
        setRecent([])
      }
    }
    run().catch(() => null)
  }, [version])
  const [filter, setFilter] = useState('')
  const [filterMode, setFilterMode] = useState(false)
  const [recentIdx, setRecentIdx] = useState(-1)
  const filtered = filter ? COMMANDS.filter(c => c.name.toLowerCase().includes(filter.toLowerCase())) : COMMANDS
  useInput((input, key) => {
    if (!filterMode) {
      if (input === '/') {
        setFilterMode(true)
        return
      }
      if (recent.length > 0 && key.upArrow) {
        setRecentIdx(i => Math.min(i + 1, recent.length - 1))
        return
      }
      if (recent.length > 0 && key.downArrow) {
        setRecentIdx(i => Math.max(i - 1, -1))
        return
      }
      if (recentIdx >= 0 && key.return) {
        const entry = recent[recentIdx]
        if (entry) {
          app.exit()
          onExit(entry.cmd as Action)
          return
        }
      }
      const match = COMMANDS.find(c => c.key === input)
      if (match) {
        app.exit()
        onExit(match.action)
        return
      }
      if (input === 'q' || (key.ctrl && input === 'c') || key.escape) {
        app.exit()
        onExit('exit')
      }
      return
    }
    if (key.escape) {
      setFilterMode(false)
      setFilter('')
      return
    }
    if (key.ctrl && input === 'c') {
      app.exit()
      onExit('exit')
      return
    }
    if (key.return) {
      const pick = filtered[0]
      if (pick) {
        app.exit()
        onExit(pick.action)
      } else {
        setFilterMode(false)
        setFilter('')
      }
      return
    }
    if (key.backspace || key.delete) {
      setFilter(f => f.slice(0, -1))
      return
    }
    if (input && !key.ctrl && !key.meta && PRINTABLE_KEY.test(input)) setFilter(f => f + input)
  })
  return (
    <Box flexDirection='column' padding={1}>
      <Box flexDirection='column' marginBottom={1}>
        <Box>
          <Text bold color='cyan'>
            noboil
          </Text>
          <Text dimColor> v{version}</Text>
          {latest && latest !== version ? <Text color='yellow'> (v{latest} available — press u to upgrade)</Text> : null}
        </Box>
        <Text dimColor>schema-first, zero-boilerplate fullstack</Text>
      </Box>
      {manifest ? (
        <Box
          borderColor='gray'
          borderStyle='round'
          flexDirection='column'
          marginBottom={1}
          paddingLeft={1}
          paddingRight={1}>
          <Text bold>Project</Text>
          <Text>
            <Text dimColor>cwd: </Text>
            {cwd}
          </Text>
          <Text>
            <Text dimColor>db: </Text>
            {manifest.db}
          </Text>
          <Text>
            <Text dimColor>demos: </Text>
            {manifest.includeDemos ? 'yes' : 'no'}
          </Text>
          <Text>
            <Text dimColor>from: </Text>
            {manifest.scaffoldedFrom.slice(0, 7)}
          </Text>
        </Box>
      ) : (
        <Box marginBottom={1}>
          <Text dimColor>No noboil project detected in {cwd}. Press i to start.</Text>
        </Box>
      )}
      <Box flexDirection='column'>
        <Text bold>Commands</Text>
        {filtered.map(c => (
          <Box key={c.name}>
            <Text color='cyan'> {c.key}</Text>
            <Text dimColor> · </Text>
            <Text color='cyan'>{c.name.padEnd(12)}</Text>
            <Text dimColor>{c.desc}</Text>
          </Box>
        ))}
        {filtered.length === 0 ? <Text color='yellow'>no matches for &quot;{filter}&quot;</Text> : null}
      </Box>
      {recent.length > 0 ? (
        <Box flexDirection='column' marginTop={1}>
          <Text dimColor>Recent (↑↓ select, ↵ rerun):</Text>
          {recent.map((r, i) => (
            <Box key={`${r.at}-${r.cmd}`}>
              <Text color={i === recentIdx ? 'cyan' : undefined}>{i === recentIdx ? '› ' : '  '}</Text>
              <Text color={i === recentIdx ? 'cyan' : undefined} dimColor={i !== recentIdx}>
                {r.cmd} {r.args.join(' ')}
              </Text>
            </Box>
          ))}
        </Box>
      ) : null}
      {filterMode ? (
        <Box marginTop={1}>
          <Text color='cyan'>/</Text>
          <Text>{filter}</Text>
          <Text color='cyan'>_</Text>
          <Text dimColor> · ↵ run first match · ⌫ clear · esc cancel</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text dimColor>single-key run · / filter · ↑↓ recent · q/esc exit</Text>
        </Box>
      )}
    </Box>
  )
}
const readManifest = (cwd: string): Manifest | null => {
  const p = join(cwd, '.noboilrc.json')
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Manifest
  } catch {
    return null
  }
}
const runDashboard = async (): Promise<Action> => {
  const cwd = process.cwd()
  const manifest = readManifest(cwd)
  const version = await getCliVersion()
  return new Promise<Action>(resolve => {
    const { unmount } = render(<DashboardApp cwd={cwd} manifest={manifest} onExit={resolve} version={version} />)
    process.on('SIGINT', () => {
      unmount()
      resolve('exit')
    })
  })
}
export type { Action }
export { runDashboard }
