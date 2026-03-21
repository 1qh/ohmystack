/** biome-ignore-all lint/performance/noAwaitInLoops: sequential middleware chain */
import { createComposeMiddleware, createInputSanitize, sanitizeRec, sanitizeString } from '@a/shared/server/middleware'
import type { GlobalHookCtx, GlobalHooks, Middleware, MiddlewareCtx, Rec } from './types'
import { log } from './helpers'
const withOp = (ctx: GlobalHookCtx, op: MiddlewareCtx['operation']): MiddlewareCtx => ({ ...ctx, operation: op }),
  composeMiddleware = (...middlewares: Middleware[]): GlobalHooks =>
    createComposeMiddleware({ middlewares, toMiddlewareCtx: withOp }) as GlobalHooks,
  auditLog = (opts?: { logLevel?: 'debug' | 'info'; verbose?: boolean }): Middleware => {
    const level = opts?.logLevel ?? 'info',
      verbose = opts?.verbose ?? false
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
  },
  DEFAULT_SLOW_THRESHOLD_MS = 500,
  slowQueryWarn = (opts?: { threshold?: number }): Middleware => {
    const threshold = opts?.threshold ?? DEFAULT_SLOW_THRESHOLD_MS
    return {
      afterCreate: (ctx, { row }) => {
        const dur = Date.now() - (((ctx as unknown as Rec)._mwStart as number | undefined) ?? Date.now())
        if (dur > threshold) log('warn', 'slow:create', { durationMs: dur, row, table: ctx.table, threshold })
      },
      afterDelete: (ctx, { row }) => {
        const dur = Date.now() - (((ctx as unknown as Rec)._mwStart as number | undefined) ?? Date.now())
        if (dur > threshold) log('warn', 'slow:delete', { durationMs: dur, row, table: ctx.table, threshold })
      },
      afterUpdate: (ctx, { prev }) => {
        const dur = Date.now() - (((ctx as unknown as Rec)._mwStart as number | undefined) ?? Date.now())
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
  },
  inputSanitize = (opts?: { fields?: string[] }): Middleware => createInputSanitize(opts) as Middleware
export { auditLog, composeMiddleware, inputSanitize, sanitizeRec, sanitizeString, slowQueryWarn }
