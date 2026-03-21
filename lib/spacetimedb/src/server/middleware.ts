import { createComposeMiddleware, sanitizeRec, sanitizeString } from '@a/shared/server/middleware'
import type { GlobalHookCtx, GlobalHooks, Middleware, MiddlewareCtx, Rec } from './types'
import { log } from './helpers'
const withOp = (ctx: GlobalHookCtx, op: MiddlewareCtx['operation']): MiddlewareCtx => ({ ...ctx, operation: op }),
  composeMiddleware = (...middlewares: Middleware[]): GlobalHooks =>
    createComposeMiddleware<
      GlobalHookCtx,
      MiddlewareCtx,
      Rec,
      { data: Rec },
      { data: Rec; row: Rec },
      { patch: Rec; prev: Rec },
      { next: Rec; patch: Rec; prev: Rec },
      { row: Rec },
      { row: Rec }
    >({
      applyBeforeUpdateArgs: (args, patch) => ({ patch, prev: args.prev }),
      getBeforeCreateData: args => args.data,
      getBeforeUpdatePatch: args => args.patch,
      middlewares,
      setBeforeCreateData: (_args, data) => ({ data }),
      withOp
    }),
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
    const threshold = opts?.threshold ?? DEFAULT_SLOW_THRESHOLD_MS,
      starts = new WeakMap<object, number>(),
      getStart = (ctx: object) => starts.get(ctx) ?? Date.now(),
      mark = (ctx: object) => {
        starts.set(ctx, Date.now())
      }
    return {
      afterCreate: (ctx, { row }) => {
        const dur = Date.now() - getStart(ctx)
        if (dur > threshold) log('warn', 'slow:create', { durationMs: dur, row, table: ctx.table, threshold })
      },
      afterDelete: (ctx, { row }) => {
        const dur = Date.now() - getStart(ctx)
        if (dur > threshold) log('warn', 'slow:delete', { durationMs: dur, row, table: ctx.table, threshold })
      },
      afterUpdate: (ctx, { prev }) => {
        const dur = Date.now() - getStart(ctx)
        if (dur > threshold) log('warn', 'slow:update', { durationMs: dur, prev, table: ctx.table, threshold })
      },
      beforeCreate: (ctx, { data }) => {
        mark(ctx)
        return data
      },
      beforeDelete: ctx => {
        mark(ctx)
      },
      beforeUpdate: (ctx, { patch }) => {
        mark(ctx)
        return patch
      },
      name: 'slowQueryWarn'
    }
  },
  inputSanitize = (opts?: { fields?: string[] }): Middleware => {
    const targetFields = opts?.fields ? new Set(opts.fields) : undefined
    return {
      beforeCreate: (_ctx, { data }) => {
        if (targetFields) {
          const result: Rec = { ...data }
          for (const f of targetFields) if (typeof result[f] === 'string') result[f] = sanitizeString(result[f])
          return result
        }
        return sanitizeRec(data) as Rec
      },
      beforeUpdate: (_ctx, { patch }) => {
        if (targetFields) {
          const result: Rec = { ...patch }
          for (const f of targetFields) if (typeof result[f] === 'string') result[f] = sanitizeString(result[f])
          return result
        }
        return sanitizeRec(patch) as Rec
      },
      name: 'inputSanitize'
    }
  }
export { auditLog, composeMiddleware, inputSanitize, sanitizeRec, sanitizeString, slowQueryWarn }
