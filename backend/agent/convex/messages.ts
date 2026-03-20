import { string } from 'zod/v4'

import { q } from '../lazy'
const listMessages = q({
  args: { threadId: string() },
  handler: async (ctx, { threadId }) => {
    const session = await ctx.db
      .query('session')
      .withIndex('by_user_threadId', idx => idx.eq('userId', ctx.user._id as never).eq('threadId', threadId))
      .unique()
    if (!session) {
      const taskPromise = ctx.db
          .query('tasks')
          .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
          .first(),
        task = await taskPromise
      if (!task) throw new Error('thread_not_found')
      const taskSession = await ctx.db.get(task.sessionId)
      if (taskSession?.userId !== ctx.user._id) throw new Error('thread_not_found')
    }
    const messages = await ctx.db
      .query('messages')
      .withIndex('by_threadId', idx => idx.eq('threadId', threadId))
      .order('desc')
      .take(100)
    messages.reverse()
    return messages
  }
})
export { listMessages }
