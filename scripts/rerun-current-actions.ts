import { spawnSync } from 'bun'

interface CmdResult {
  exitCode: number
  stderr: string
  stdout: string
}

interface GhJob {
  conclusion: null | string
  databaseId: number
  name: string
  status: string
}

interface GhRun {
  conclusion: null | string
  databaseId: number
  status: string
  workflowName: string
}

interface GhRunJobs {
  jobs: GhJob[]
}

interface RunOutcome {
  hardFailure: boolean
  requested: boolean
  targeted: boolean
}

interface TargetJobs {
  failedJobs: GhJob[]
  skippedJobs: GhJob[]
}

const failureConclusions = new Set(['action_required', 'cancelled', 'failure', 'stale', 'startup_failure', 'timed_out']),
  toText = ({ value }: { value?: null | Uint8Array }) => new TextDecoder().decode(value ?? new Uint8Array()).trim(),
  print = ({ text }: { text: string }) => {
    process.stdout.write(`${text}\n`)
  },
  runCmd = ({ allowFailure, cmd }: { allowFailure?: boolean; cmd: string[] }): CmdResult => {
    const result = spawnSync({
        cmd,
        cwd: process.cwd(),
        stderr: 'pipe',
        stdout: 'pipe'
      }),
      output = {
        exitCode: result.exitCode,
        stderr: toText({ value: result.stderr }),
        stdout: toText({ value: result.stdout })
      }

    if (output.exitCode !== 0 && !allowFailure)
      throw new Error(
        [`Command failed (${output.exitCode}): ${cmd.join(' ')}`, output.stderr || output.stdout || 'No output'].join('\n')
      )

    return output
  },
  runJson = ({ cmd }: { cmd: string[] }) => JSON.parse(runCmd({ cmd }).stdout) as unknown,
  isAlreadyRunning = ({ result }: { result: CmdResult }) => {
    const text = `${result.stderr}\n${result.stdout}`.toLowerCase()
    return text.includes('already running')
  },
  rerunJob = ({ jobId, repo }: { jobId: number; repo: string }) =>
    runCmd({
      allowFailure: true,
      cmd: ['gh', 'api', '-X', 'POST', `repos/${repo}/actions/jobs/${jobId}/rerun`]
    }),
  getLatestRunsForHead = ({ headSha }: { headSha: string }) => {
    const rawRuns = runJson({
        cmd: [
          'gh',
          'run',
          'list',
          '--commit',
          headSha,
          '--limit',
          '100',
          '--json',
          'databaseId,workflowName,status,conclusion'
        ]
      }) as GhRun[],
      seen = new Set<string>(),
      runs: GhRun[] = []

    for (const run of rawRuns) {
      const alreadySeen = seen.has(run.workflowName)

      if (!alreadySeen) {
        seen.add(run.workflowName)
        runs.push(run)
      }
    }

    return runs
  },
  getTargetJobs = ({ runId }: { runId: number }): TargetJobs => {
    const { jobs } = runJson({
        cmd: ['gh', 'run', 'view', String(runId), '--json', 'jobs']
      }) as GhRunJobs,
      failedJobs: GhJob[] = [],
      skippedJobs: GhJob[] = []

    for (const job of jobs) {
      const isCompleted = job.status === 'completed'

      if (isCompleted) {
        const conclusion = job.conclusion ?? ''

        if (failureConclusions.has(conclusion)) failedJobs.push(job)
        else if (conclusion === 'skipped') skippedJobs.push(job)
      }
    }

    return {
      failedJobs,
      skippedJobs
    }
  },
  requestFailedRerun = ({ failedJobs, repo, runId }: { failedJobs: GhJob[]; repo: string; runId: number }): RunOutcome => {
    const rerunFailed = runCmd({
      allowFailure: true,
      cmd: ['gh', 'run', 'rerun', String(runId), '--failed']
    })

    if (rerunFailed.exitCode === 0 || isAlreadyRunning({ result: rerunFailed })) {
      print({ text: `  rerun requested for failed jobs (${failedJobs.length})` })
      return { hardFailure: false, requested: true, targeted: true }
    }

    const fallback = rerunJob({
      jobId: failedJobs[0].databaseId,
      repo
    })

    if (fallback.exitCode === 0 || isAlreadyRunning({ result: fallback })) {
      print({ text: `  fallback rerun requested for job ${failedJobs[0].databaseId}` })
      return { hardFailure: false, requested: true, targeted: true }
    }

    print({
      text: `  failed to request rerun: ${rerunFailed.stderr || rerunFailed.stdout || fallback.stderr || fallback.stdout}`
    })

    return { hardFailure: true, requested: false, targeted: true }
  },
  requestSkippedRerun = ({ repo, skippedJobs }: { repo: string; skippedJobs: GhJob[] }): RunOutcome => {
    const skippedJob = skippedJobs[0],
      skippedRerun = rerunJob({
        jobId: skippedJob.databaseId,
        repo
      }),
      requested = skippedRerun.exitCode === 0 || isAlreadyRunning({ result: skippedRerun })

    if (requested) {
      print({ text: `  rerun requested for skipped job ${skippedJob.databaseId}` })
      return { hardFailure: false, requested: true, targeted: true }
    }

    print({ text: `  failed to request skipped rerun: ${skippedRerun.stderr || skippedRerun.stdout}` })
    return { hardFailure: true, requested: false, targeted: true }
  },
  processRun = ({ repo, run }: { repo: string; run: GhRun }): RunOutcome => {
    const isCompleted = run.status === 'completed',
      isSuccess = run.conclusion === 'success'

    if (!isCompleted || isSuccess) return { hardFailure: false, requested: false, targeted: false }

    const { failedJobs, skippedJobs } = getTargetJobs({ runId: run.databaseId }),
      hasTargets = failedJobs.length > 0 || skippedJobs.length > 0

    if (!hasTargets) return { hardFailure: false, requested: false, targeted: false }

    print({ text: `Run ${run.databaseId} (${run.workflowName}, ${run.conclusion ?? 'unknown'})` })

    if (failedJobs.length > 0)
      return requestFailedRerun({
        failedJobs,
        repo,
        runId: run.databaseId
      })

    return requestSkippedRerun({
      repo,
      skippedJobs
    })
  },
  main = () => {
    const headSha = runCmd({ cmd: ['git', 'rev-parse', 'HEAD'] }).stdout,
      { nameWithOwner } = runJson({
        cmd: ['gh', 'repo', 'view', '--json', 'nameWithOwner']
      }) as {
        nameWithOwner: string
      },
      runs = getLatestRunsForHead({ headSha })

    if (runs.length === 0) {
      print({ text: `No workflow runs found for commit ${headSha}.` })
      return
    }

    let rerunRequests = 0,
      targetedRuns = 0,
      hardFailures = 0

    for (const run of runs) {
      const outcome = processRun({
        repo: nameWithOwner,
        run
      })

      if (outcome.targeted) targetedRuns += 1

      if (outcome.requested) rerunRequests += 1

      if (outcome.hardFailure) hardFailures += 1
    }

    if (targetedRuns === 0) {
      print({ text: `No non-success runs for current commit ${headSha}. Nothing to rerun.` })
      return
    }

    print({ text: `Requested reruns for ${rerunRequests} run(s) out of ${targetedRuns} targeted run(s).` })

    if (hardFailures > 0) throw new Error(`Could not request rerun for ${hardFailures} run(s).`)
  }

main()
