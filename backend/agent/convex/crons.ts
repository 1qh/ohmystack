import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval('timeout stale runs', { minutes: 5 }, internal.orchestrator.timeoutStaleRuns)
crons.interval('timeout stale tasks', { minutes: 5 }, internal.staleTaskCleanup.timeoutStaleTasks)
crons.interval('cleanup stale messages', { minutes: 5 }, internal.staleTaskCleanup.cleanupStaleMessages)
crons.interval('archive idle sessions', { hours: 1 }, internal.retention.archiveIdleSessions)
crons.cron('cleanup archived sessions', '0 3 * * *', internal.retention.cleanupArchivedSessions)

export default crons
