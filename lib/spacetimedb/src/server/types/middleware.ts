import type { GlobalHookCtx, Rec } from './common'

interface Middleware {
  afterCreate?: (ctx: MiddlewareCtx, args: { data: Rec; row: Rec }) => Promise<void> | void
  afterDelete?: (ctx: MiddlewareCtx, args: { row: Rec }) => Promise<void> | void
  afterUpdate?: (ctx: MiddlewareCtx, args: { next: Rec; patch: Rec; prev: Rec }) => Promise<void> | void
  beforeCreate?: (ctx: MiddlewareCtx, args: { data: Rec }) => Promise<Rec> | Rec
  beforeDelete?: (ctx: MiddlewareCtx, args: { row: Rec }) => Promise<void> | void
  beforeUpdate?: (ctx: MiddlewareCtx, args: { patch: Rec; prev: Rec }) => Promise<Rec> | Rec
  name: string
}

interface MiddlewareCtx extends GlobalHookCtx {
  operation: 'create' | 'delete' | 'update'
}

export type { Middleware, MiddlewareCtx }
