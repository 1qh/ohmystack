/* oxlint-disable no-promise-executor-return, eslint-plugin-promise(param-names), typescript-eslint(strict-void-return) */
import { Box, render, Text, useApp, useInput } from 'ink'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getCliVersion } from './shared/version'
interface DashboardProps {
  cwd: string
  manifest: Manifest | null
  onExit: () => void
  version: string
}
interface Manifest {
  db: string
  includeDemos: boolean
  scaffoldedAt: string
  scaffoldedFrom: string
  version: number
}
const COMMANDS: { desc: string; name: string }[] = [
  { desc: 'Create a new noboil project', name: 'init' },
  { desc: 'Check project health', name: 'doctor' },
  { desc: 'Pull upstream changes', name: 'sync' },
  { desc: 'Detach from upstream', name: 'eject' },
  { desc: 'Print shell completion script', name: 'completions' }
]
const DashboardApp = ({ cwd, manifest, onExit, version }: DashboardProps) => {
  const app = useApp()
  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c') || key.escape || key.return) {
      app.exit()
      onExit()
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
          <Text dimColor>No noboil project detected in {cwd}. Run `noboil init` to start.</Text>
        </Box>
      )}
      <Box flexDirection='column'>
        <Text bold>Commands</Text>
        {COMMANDS.map(c => (
          <Box key={c.name}>
            <Text color='cyan'> {c.name.padEnd(14)}</Text>
            <Text dimColor>{c.desc}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Run `noboil &lt;command&gt; --help` for options · q/↵ exit</Text>
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
const runDashboard = async (): Promise<void> => {
  const cwd = process.cwd()
  const manifest = readManifest(cwd)
  const version = await getCliVersion()
  await new Promise<void>(resolve => {
    const { unmount } = render(<DashboardApp cwd={cwd} manifest={manifest} onExit={resolve} version={version} />)
    process.on('SIGINT', () => {
      unmount()
      resolve()
    })
  })
}
export { runDashboard }
