# Orchestrator Runtime (AI SDK v6)

The orchestrator runs directly in Convex actions with AI SDK `streamText()`. Message persistence, queueing, continuation, and recovery all use first-party tables in `backend/agent`.

## Scope and References

- AI SDK `streamText`: <https://ai-sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text>
- Convex actions: <https://docs.convex.dev/functions/actions>
- OpenAgent loop reference: `oh-my-openagent/src/index.ts`

Implementation:

- `backend/agent/convex/orchestrator.ts`
- `backend/agent/convex/orchestratorNode.ts`
- `backend/agent/convex/messages.ts`
- `backend/agent/convex/compaction.ts`

## Queue-Per-Thread Concurrency Model

### Core table: `threadRunState`

One row per `threadId`, created lazily by `ensureRunState` and treated as a singleton.

Key fields:

- `status`: `idle | active`
- `activeRunToken`
- `runClaimed`
- `queuedPromptMessageId`
- `queuedReason`: `user_message | task_completion | todo_continuation`
- `queuedPriority`
- `autoContinueStreak`
- `activatedAt`, `claimedAt`, `runHeartbeatAt`
- `lastError`

### Priority queue policy

- One active run per thread and one queued slot.
- Priority: `user_message (2) > task_completion (1) > todo_continuation (0)`.
- Lower-priority enqueue cannot replace higher-priority queued payload.
- Equal priority replaces older queued payload.
- User-message enqueue resets continuation streak.

```mermaid
stateDiagram-v2
    [*] --> Idle

    state Idle {
      [*] --> NoQueue
      NoQueue: status=idle\nactiveRunToken=null\nqueuedPromptMessageId=null
    }

    state Active {
      [*] --> RunningNoQueue
      RunningNoQueue: status=active\nactiveRunToken=set\nqueuedPromptMessageId=null
      RunningWithQueue: status=active\nactiveRunToken=set\nqueuedPromptMessageId=set\npriority=user>task>todo
      RunningNoQueue --> RunningWithQueue: enqueueRun while active
      RunningWithQueue --> RunningWithQueue: higher/equal priority replace
      RunningWithQueue --> RunningNoQueue: finishRun schedules next token
    }

    Idle --> Active: enqueueRun (status=idle)\ncreate runToken + schedule action
    Active --> Idle: finishRun and no queued payload
```

## CAS Transition Contracts

`enqueueRun`, `claimRun`, and `finishRun` are compare-and-set lifecycle mutations.

```mermaid
flowchart TD
    E[enqueueRun] -->|state=idle| A[set activeRunToken\nrunClaimed=false\nstatus=active\nschedule runOrchestrator]
    E -->|state=active + priority wins| Q[patch queuedPromptMessageId\nqueuedReason\nqueuedPriority]
    E -->|state=active + lower priority| N[no-op reject]

    C[claimRun] -->|token matches + runClaimed!=true| C1[set runClaimed=true\nclaimedAt=now\nrunHeartbeatAt=now]
    C -->|mismatch/claimed| C0[claim failed]

    F[finishRun] -->|token mismatch| F0[no-op]
    F -->|queuedPromptMessageId exists| F1[schedule next runToken\nclear queue\nkeep status=active]
    F -->|no queue| F2[clear active token/timers\nstatus=idle]
```

## `runOrchestrator` Action Flow

1. `claimRun(threadId, runToken)` consuming CAS claim.
2. Build stale guard from active token check.
3. Start heartbeat interval (`heartbeatRun`).
4. Run pre-generation compaction for closed prefix.
5. Stream turn with AI SDK `streamText()`.
6. Run `postTurnAudit` continuation logic.
7. Always call `finishRun` in `finally`.

```mermaid
flowchart TD
    S[runOrchestrator action start] --> C{claimRun ok?}
    C -- no --> X[exit]
    C -- yes --> ST{isStale?}
    ST -- yes --> FIN[finishRun]
    ST -- no --> CMP[compactIfNeeded]
    CMP --> ST2{isStale?}
    ST2 -- yes --> FIN
    ST2 -- no --> STR[streamText + persist deltas]
    STR --> ST3{isStale?}
    ST3 -- yes --> FIN
    ST3 -- no --> AUD[postTurnAudit]
    AUD --> FIN[finishRun]
    FIN --> D[done]
```

## DIY Streaming Architecture

The orchestrator writes stream output directly to Convex message rows instead of relying on framework-managed message storage.

- The turn starts with `streamText()` in the Node action.
- Each text delta appends to an in-memory buffer and patches the assistant row’s `streamingContent` so the client can render partial output immediately.
- The frontend subscribes via `useQuery` to the thread messages list, so each patch re-renders in real time without a separate stream channel.
- On stream completion, the row is finalized by moving the full text into `content`, marking `isComplete: true`, and clearing transient streaming state.

Implementation: `backend/agent/convex/orchestratorNode.ts`

## Post-Turn Auto-Continue Audit

`postTurnAuditFenced` performs the continuation decision as one token-fenced mutation, so decision and side effects stay atomic and stale runs cannot schedule new work.

- Verify `activeRunToken === runToken` before doing any audit work.
- Evaluate stop conditions in order: incomplete todos, active background tasks, input requested, and streak cap.
- If any stop condition applies, reset continuation state and stop.
- If continuation is allowed, write a reminder system message and enqueue `todo_continuation` with streak increment.
- Update completion notification metadata inside the same fenced mutation when applicable.

```mermaid
flowchart TD
    A[postTurnAudit] --> T{incomplete todos > 0?}
    T -- no --> R0[reset streak to 0\nstop]
    T -- yes --> BG{active tasks > 0?}
    BG -- yes --> R1[reset streak to 0\nstop]
    BG -- no --> IN{turnRequestedInput?}
    IN -- yes --> R2[reset streak to 0\nstop]
    IN -- no --> CAP{streak >= 5?}
    CAP -- yes --> S0[stop]
    CAP -- no --> REM[insert todo reminder message]
    REM --> ENQ[enqueueRun reason=todo_continuation\nincrementStreak=true]
    ENQ --> S1[continue scheduled or queue-updated]
```

## Heartbeat and Wall-Clock Timeout

`runOrchestrator` sends heartbeats while running so stale-run recovery can distinguish live execution from dead actions.

- `claimRun` initializes `runHeartbeatAt` when a token is consumed.
- While the action is alive, it updates `runHeartbeatAt` on a regular interval (about every two minutes).
- `timeoutStaleRuns` treats claimed runs as stale when heartbeat age exceeds 15 minutes (falling back to `claimedAt`), and unclaimed active runs as stale after 5 minutes from `activatedAt`.
- A hard wall-clock cap of 15 minutes from `activatedAt` is enforced even if heartbeats continue.

Recovery behavior:

- if queued payload exists, mint fresh token and reschedule,
- if no queued payload, reset run state to idle.

```mermaid
sequenceDiagram
    participant ENQ as enqueueRun
    participant ORCH as runOrchestrator
    participant STATE as threadRunState
    participant CRON as timeoutStaleRuns

    ENQ->>STATE: status=active, activatedAt, activeRunToken
    ORCH->>STATE: claimRun (runClaimed=true, claimedAt)
    loop every 2m
      ORCH->>STATE: heartbeatRun (runHeartbeatAt=now)
    end
    CRON->>STATE: scan active rows
    CRON->>CRON: stale heartbeat OR activatedAt > 15m?
    alt queued prompt exists
      CRON->>STATE: replace token + reschedule run
    else no queued prompt
      CRON->>STATE: clear active token, set idle
    end
```

## Reliability Notes

- Queue transitions stay mutation-first and idempotent.
- Token fencing prevents stale runs from enqueueing new continuations.
- All terminal tool outcomes are serialized into model context so follow-up turns keep full tool history.
- Completion reminders and continuation enqueue remain separate operations, which preserves observability and retryability in operational recovery paths.

## Stagnation Detection

To avoid infinite continuation loops when todos are not changing, the runtime tracks a normalized todo snapshot between continuation cycles.

- The snapshot stores stable todo identity and status fields in a deterministic order.
- If two consecutive continuation checks see the same snapshot, `stagnationCount` increments.
- When the counter reaches the configured threshold, continuation stops and streak state resets.
- Any real progress (status transitions, completed-count increase, or reduced incomplete set) resets stagnation tracking.

Reference: `oh-my-openagent/src/hooks/todo-continuation-enforcer/stagnation-detection.ts`

## Continuation Cooldown

Continuation failures are rate-limited with exponential backoff so repeated failures do not thrash the queue.

- The runtime tracks consecutive continuation failures and timestamp of the latest attempt.
- Cooldown duration grows as `5000ms * 2^min(consecutiveFailures, 5)`.
- After repeated failures at the cap, continuation is paused until the reset window elapses.
- A successful continuation resets the failure counter.

Reference: `oh-my-openagent/src/hooks/todo-continuation-enforcer/idle-event.ts`

## Lifecycle Summary

The orchestrator run lifecycle is built from three compare-and-set mutations that fence each stage of execution and keep scheduling idempotent.

- `enqueueRun` is the entry mutation for user turns and internal reminders; it either activates an idle thread by minting a run token and scheduling `runOrchestrator`, or updates the single queued slot using persisted priority rules.
- `claimRun` is the consumption mutation for scheduled work; only the action instance that presents the matching active token and sees `runClaimed` unset can flip the claim bit and proceed.
- `finishRun` is the terminal mutation; it closes the active token, schedules the next token if queued work exists, or returns the thread to `idle` when the queue is empty.

Together these mutations create a deterministic lifecycle: enqueue establishes intent, claim establishes a single executor, and finish resolves the run while safely draining queued follow-up work.

## Task Reminder Injection

The runtime tracks task-follow-up drift with a `turnsSinceTaskTool` counter in thread run state.

- The counter increments when turns complete without using task tools.
- It resets immediately when the model uses task-related tools (`delegate`, `taskStatus`, or `taskOutput`).
- At a threshold of `10`, the orchestrator injects a system reminder listing pending tasks so the model explicitly checks task progress or outputs.

This mechanism prevents long conversational runs from forgetting delegated background work while keeping reminder behavior deterministic and bounded.

## Tests

See `agent/plan/testing.md`.
