/* oxlint-disable no-promise-executor-return, eslint-plugin-promise(param-names), typescript-eslint(strict-void-return), eslint-plugin-promise(prefer-await-to-then) */
import { Box, render, Text, useApp, useInput } from 'ink'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useEffect, useState } from 'react'
import { checkForUpdate } from './shared/update-check'
import { getCliVersion } from './shared/version'
type Action = 'add' | 'completions' | 'doctor' | 'eject' | 'exit' | 'init' | 'sync' | 'upgrade'
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
const COMMANDS: { action: Action; desc: string; key: string; name: string }[] = [
  { action: 'init', desc: 'Create a new noboil project', key: 'i', name: 'init' },
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
  useEffect(() => {
    const run = async () => {
      try {
        setLatest(await checkForUpdate(version))
      } catch {
        setLatest(null)
      }
    }
    run().catch(() => null)
  }, [version])
  useInput((input, key) => {
    const match = COMMANDS.find(c => c.key === input)
    if (match) {
      app.exit()
      onExit(match.action)
      return
    }
    if (input === 'q' || (key.ctrl && input === 'c') || key.escape || key.return) {
      app.exit()
      onExit('exit')
    }
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
        {COMMANDS.map(c => (
          <Box key={c.name}>
            <Text color='cyan'> {c.key}</Text>
            <Text dimColor> · </Text>
            <Text color='cyan'>{c.name.padEnd(12)}</Text>
            <Text dimColor>{c.desc}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>single-key to run · q/↵/esc exit</Text>
      </Box>
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
