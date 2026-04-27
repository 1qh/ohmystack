/** biome-ignore-all lint/performance/noAwaitInLoops: sequential middleware chain */
/* oxlint-disable no-underscore-dangle -- Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
/* oxlint-disable eslint(no-underscore-dangle) */
import type { GlobalHookCtx, GlobalHooks, Middleware, MiddlewareCtx, Rec } from './types'
import { createComposeMiddleware, createInputSanitize, sanitizeRec, sanitizeString } from '../../shared/server/middleware'
import { log } from './helpers'
const withOp = (ctx: GlobalHookCtx, op: MiddlewareCtx['operation']): MiddlewareCtx => ({ ...ctx, operation: op })
/** Combine multiple Middleware factories into a single GlobalHooks bundle for `noboil({ hooks })`. */
const composeMiddleware = (...middlewares: Middleware[]): GlobalHooks =>
  createComposeMiddleware({ middlewares, toMiddlewareCtx: withOp })
/** Logs every reducer-driven create/update/delete with table + sender. `verbose: true` also logs the row data / patched field names. */
const auditLog = (opts?: { logLevel?: 'debug' | 'info'; verbose?: boolean }): Middleware => {
  const level = opts?.logLevel ?? 'info'
  const verbose = opts?.verbose ?? false
  return {
    afterCreate: (ctx, { data, row }) => {
      const entry: Rec = { op: 'create', row, sender: ctx.sender.toString(), table: ctx.table }
      if (verbose) entry.data = data
      log(level, 'audit:create', entry)
    },
    afterDelete: (ctx, { row }) => {
      log(level, 'audit:delete', { op: 'delete', row, sender: ctx.sender.toString(), table: ctx.table })
    },
    afterUpdate: (ctx, { patch, prev }) => {
      const entry: Rec = { op: 'update', prev, sender: ctx.sender.toString(), table: ctx.table }
      if (verbose) entry.fields = Object.keys(patch)
      log(level, 'audit:update', entry)
    },
    name: 'auditLog'
  }
}
const DEFAULT_SLOW_THRESHOLD_MS = 500
/** Emits `warn`-level log when any reducer-driven mutation exceeds `threshold` ms (default 500ms). */
const slowQueryWarn = (opts?: { threshold?: number }): Middleware => {
  const threshold = opts?.threshold ?? DEFAULT_SLOW_THRESHOLD_MS
  return {
    afterCreate: (ctx, { row }) => {
      const start = (ctx as unknown as Rec)._mwStart as number | undefined
      if (start === undefined) return
      const dur = Date.now() - start
      if (dur > threshold) log('warn', 'slow:create', { durationMs: dur, row, table: ctx.table, threshold })
    },
    afterDelete: (ctx, { row }) => {
      const start = (ctx as unknown as Rec)._mwStart as number | undefined
      if (start === undefined) return
      const dur = Date.now() - start
      if (dur > threshold) log('warn', 'slow:delete', { durationMs: dur, row, table: ctx.table, threshold })
    },
    afterUpdate: (ctx, { prev }) => {
      const start = (ctx as unknown as Rec)._mwStart as number | undefined
      if (start === undefined) return
      const dur = Date.now() - start
      if (dur > threshold) log('warn', 'slow:update', { durationMs: dur, prev, table: ctx.table, threshold })
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
/** Strips control chars + zero-width chars from string fields before insert/update. Restrict to specific fields via `opts.fields`. */
const inputSanitize = (opts?: { fields?: string[] }): Middleware => createInputSanitize(opts)
export { auditLog, composeMiddleware, inputSanitize, sanitizeRec, sanitizeString, slowQueryWarn }
