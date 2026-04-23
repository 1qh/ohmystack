/* oxlint-disable no-promise-executor-return, eslint-plugin-promise(param-names), typescript-eslint(strict-void-return), eslint(no-shadow) */
/* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
import { Box, render, Text, useApp, useInput } from 'ink'
import Spinner from 'ink-spinner'
import { useEffect, useState } from 'react'
type EjectRunner = () => void
type Phase = 'confirm' | 'done' | 'running'
const Confirm = ({ onAnswer }: { onAnswer: (v: boolean) => void }) => {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y' || key.return) onAnswer(true)
    else if (input === 'n' || input === 'N' || key.escape || input === 'q') onAnswer(false)
  })
  return (
    <Box flexDirection='column'>
      <Text bold color='yellow'>
        Eject: this will inline noboil into lib/noboil and disable sync.
      </Text>
      <Text dimColor>Proceed? (y/n)</Text>
    </Box>
  )
}
const EjectApp = ({
  assumeYes,
  dryRun,
  onExit,
  run
}: {
  assumeYes: boolean
  dryRun: boolean
  onExit: (code: number) => void
  run: EjectRunner
}) => {
  const app = useApp()
  const [phase, setPhase] = useState<Phase>(assumeYes ? 'running' : 'confirm')
  const [ejectError, setEjectError] = useState<null | string>(null)
  useEffect(() => {
    if (phase !== 'running') return
    try {
      run()
      setPhase('done')
    } catch (error) {
      setEjectError(error instanceof Error ? error.message : String(error))
      setPhase('done')
    }
  }, [phase, run])
  useEffect(() => {
    if (phase === 'done') {
      const t = setTimeout(() => {
        app.exit()
        onExit(ejectError ? 1 : 0)
      }, 200)
      return () => clearTimeout(t)
    }
  }, [phase, app, onExit, ejectError])
  return (
    <Box flexDirection='column' padding={1}>
      <Box flexDirection='column' marginBottom={1}>
        <Text bold color='cyan'>
          noboil eject{dryRun ? ' (dry-run)' : ''}
        </Text>
        <Text dimColor>inline library locally</Text>
      </Box>
      {phase === 'confirm' ? (
        <Confirm
          onAnswer={v => {
            if (v) setPhase('running')
            else {
              app.exit()
              onExit(1)
            }
          }}
        />
      ) : null}
      {phase === 'running' ? (
        <Box>
          <Text color='cyan'>
            <Spinner type='dots' />
          </Text>
          <Text> ejecting...</Text>
        </Box>
      ) : null}
      {phase === 'done' && ejectError ? <Text color='red'>Error: {ejectError}</Text> : null}
    </Box>
  )
}
const runEjectTui = async ({
  assumeYes,
  dryRun,
  run
}: {
  assumeYes: boolean
  dryRun: boolean
  run: EjectRunner
}): Promise<number> =>
  new Promise(resolve => {
    const { unmount } = render(<EjectApp assumeYes={assumeYes} dryRun={dryRun} onExit={resolve} run={run} />)
    process.on('SIGINT', () => {
      unmount()
      resolve(1)
    })
  })
export { runEjectTui }
