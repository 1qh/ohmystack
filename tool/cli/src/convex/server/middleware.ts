/** biome-ignore-all lint/performance/noAwaitInLoops: sequential middleware chain */
import type { GlobalHookCtx, GlobalHooks, Middleware, MiddlewareCtx, Rec } from './types'
import { createComposeMiddleware, createInputSanitize, sanitizeRec, sanitizeString } from '../../shared/server/middleware'
import { log } from './helpers'
const withOp = (ctx: GlobalHookCtx, op: MiddlewareCtx['operation']): MiddlewareCtx => ({ ...ctx, operation: op })
const composeMiddleware = (...middlewares: Middleware[]): GlobalHooks =>
  createComposeMiddleware({ middlewares, toMiddlewareCtx: withOp })
const auditLog = (opts?: { logLevel?: 'debug' | 'info'; verbose?: boolean }): Middleware => {
  const level = opts?.logLevel ?? 'info'
  const verbose = opts?.verbose ?? false
  return {
    afterCreate: (ctx, { data, id }) => {
      const entry: Rec = { id, op: 'create', table: ctx.table, userId: ctx.userId }
      if (verbose) entry.data = data
      log(level, 'audit:create', entry)
    },
    afterDelete: (ctx, { id }) => {
      log(level, 'audit:delete', { id, op: 'delete', table: ctx.table, userId: ctx.userId })
    },
    afterUpdate: (ctx, { id, patch }) => {
      const entry: Rec = { id, op: 'update', table: ctx.table, userId: ctx.userId }
      if (verbose) entry.fields = Object.keys(patch)
      log(level, 'audit:update', entry)
    },
    name: 'auditLog'
  }
}
const DEFAULT_SLOW_THRESHOLD_MS = 500
const slowQueryWarn = (opts?: { threshold?: number }): Middleware => {
  const threshold = opts?.threshold ?? DEFAULT_SLOW_THRESHOLD_MS
  return {
    afterCreate: (ctx, { id }) => {
      const dur = Date.now() - (((ctx as unknown as Rec)._mwStart as number | undefined) ?? Date.now())
      if (dur > threshold) log('warn', 'slow:create', { durationMs: dur, id, table: ctx.table, threshold })
    },
    afterDelete: (ctx, { id }) => {
      const dur = Date.now() - (((ctx as unknown as Rec)._mwStart as number | undefined) ?? Date.now())
      if (dur > threshold) log('warn', 'slow:delete', { durationMs: dur, id, table: ctx.table, threshold })
    },
    afterUpdate: (ctx, { id }) => {
      const dur = Date.now() - (((ctx as unknown as Rec)._mwStart as number | undefined) ?? Date.now())
      if (dur > threshold) log('warn', 'slow:update', { durationMs: dur, id, table: ctx.table, threshold })
    },
    beforeCreate: (ctx, { data }) => {
      ;(ctx as unknown as Rec)._mwStart = Date.now()
      return data
    },
    beforeDelete: ctx => {
      ;(ctx as unknown as Rec)._mwStart = Date.now()
    },
    beforeUpdate: (ctx, { patch }) => {
      ;(ctx as unknown as Rec)._mwStart = Date.now()
      return patch
    },
    name: 'slowQueryWarn'
  }
}
const inputSanitize = (opts?: { fields?: string[] }): Middleware => createInputSanitize(opts)
export { auditLog, composeMiddleware, inputSanitize, sanitizeRec, sanitizeString, slowQueryWarn }
