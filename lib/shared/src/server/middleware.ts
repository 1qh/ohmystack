/** biome-ignore-all lint/performance/noAwaitInLoops: sequential middleware chain */
/* eslint-disable no-await-in-loop */
interface GlobalHooksLike<
  Ctx,
  CreateAfterArgs,
  CreateBeforeArgs,
  DeleteAfterArgs,
  DeleteBeforeArgs,
  UpdateAfterArgs,
  UpdateBeforeArgs
> {
  afterCreate?: (ctx: Ctx, args: CreateAfterArgs) => Promise<void>
  afterDelete?: (ctx: Ctx, args: DeleteAfterArgs) => Promise<void>
  afterUpdate?: (ctx: Ctx, args: UpdateAfterArgs) => Promise<void>
  beforeCreate?: (ctx: Ctx, args: CreateBeforeArgs) => Promise<Rec>
  beforeDelete?: (ctx: Ctx, args: DeleteBeforeArgs) => Promise<void>
  beforeUpdate?: (ctx: Ctx, args: UpdateBeforeArgs) => Promise<Rec>
}
interface MiddlewareLike<
  MCtx,
  CreateAfterArgs,
  CreateBeforeArgs,
  DeleteAfterArgs,
  DeleteBeforeArgs,
  UpdateAfterArgs,
  UpdateBeforeArgs
> {
  afterCreate?: (ctx: MCtx, args: CreateAfterArgs) => Promise<void> | void
  afterDelete?: (ctx: MCtx, args: DeleteAfterArgs) => Promise<void> | void
  afterUpdate?: (ctx: MCtx, args: UpdateAfterArgs) => Promise<void> | void
  beforeCreate?: (ctx: MCtx, args: CreateBeforeArgs) => Promise<Rec> | Rec
  beforeDelete?: (ctx: MCtx, args: DeleteBeforeArgs) => Promise<void> | void
  beforeUpdate?: (ctx: MCtx, args: UpdateBeforeArgs) => Promise<Rec> | Rec
}
type Operation = 'create' | 'delete' | 'update'
type Rec = Record<string, unknown>
const createComposeMiddleware = <
  Ctx,
  MCtx,
  CreateAfterArgs,
  CreateBeforeArgs extends { data: Rec },
  DeleteAfterArgs,
  DeleteBeforeArgs,
  UpdateAfterArgs,
  UpdateBeforeArgs extends { patch: Rec }
>({
  middlewares,
  toMiddlewareCtx
}: {
  middlewares: MiddlewareLike<
    MCtx,
    CreateAfterArgs,
    CreateBeforeArgs,
    DeleteAfterArgs,
    DeleteBeforeArgs,
    UpdateAfterArgs,
    UpdateBeforeArgs
  >[]
  toMiddlewareCtx: (ctx: Ctx, op: Operation) => MCtx
}): GlobalHooksLike<
  Ctx,
  CreateAfterArgs,
  CreateBeforeArgs,
  DeleteAfterArgs,
  DeleteBeforeArgs,
  UpdateAfterArgs,
  UpdateBeforeArgs
> => {
  const hooks: GlobalHooksLike<
    Ctx,
    CreateAfterArgs,
    CreateBeforeArgs,
    DeleteAfterArgs,
    DeleteBeforeArgs,
    UpdateAfterArgs,
    UpdateBeforeArgs
  > = {}
  const hasBeforeCreate = middlewares.some(mw => mw.beforeCreate)
  const hasAfterCreate = middlewares.some(mw => mw.afterCreate)
  const hasBeforeUpdate = middlewares.some(mw => mw.beforeUpdate)
  const hasAfterUpdate = middlewares.some(mw => mw.afterUpdate)
  const hasBeforeDelete = middlewares.some(mw => mw.beforeDelete)
  const hasAfterDelete = middlewares.some(mw => mw.afterDelete)
  if (hasBeforeCreate)
    hooks.beforeCreate = async (ctx: Ctx, args: CreateBeforeArgs) => {
      let { data } = args
      const mCtx = toMiddlewareCtx(ctx, 'create')
      for (const mw of middlewares) if (mw.beforeCreate) data = await mw.beforeCreate(mCtx, { ...args, data })
      return data
    }
  if (hasAfterCreate)
    hooks.afterCreate = async (ctx: Ctx, args: CreateAfterArgs) => {
      const mCtx = toMiddlewareCtx(ctx, 'create')
      for (const mw of middlewares) if (mw.afterCreate) await mw.afterCreate(mCtx, args)
    }
  if (hasBeforeUpdate)
    hooks.beforeUpdate = async (ctx: Ctx, args: UpdateBeforeArgs) => {
      let { patch } = args
      const mCtx = toMiddlewareCtx(ctx, 'update')
      for (const mw of middlewares) if (mw.beforeUpdate) patch = await mw.beforeUpdate(mCtx, { ...args, patch })
      return patch
    }
  if (hasAfterUpdate)
    hooks.afterUpdate = async (ctx: Ctx, args: UpdateAfterArgs) => {
      const mCtx = toMiddlewareCtx(ctx, 'update')
      for (const mw of middlewares) if (mw.afterUpdate) await mw.afterUpdate(mCtx, args)
    }
  if (hasBeforeDelete)
    hooks.beforeDelete = async (ctx: Ctx, args: DeleteBeforeArgs) => {
      const mCtx = toMiddlewareCtx(ctx, 'delete')
      for (const mw of middlewares) if (mw.beforeDelete) await mw.beforeDelete(mCtx, args)
    }
  if (hasAfterDelete)
    hooks.afterDelete = async (ctx: Ctx, args: DeleteAfterArgs) => {
      const mCtx = toMiddlewareCtx(ctx, 'delete')
      for (const mw of middlewares) if (mw.afterDelete) await mw.afterDelete(mCtx, args)
    }
  return hooks
}
const SCRIPT_TAG_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/giu
const EVENT_HANDLER_PATTERN = /\bon\w+\s*=/giu
const JAVASCRIPT_PROTO_PATTERN = /javascript\s*:/giu
const DATA_URI_SCRIPT_PATTERN = /data\s*:\s*text\/html/giu
const DANGEROUS_TAG_PATTERN = /<\s*\/?\s*(?:iframe|object|embed|applet|form|base|meta|svg|math|details|marquee)\b[^>]*>/giu
const HTML_ENCODED_SCRIPT_PATTERN = /&#(?:x0*(?:3c|3e)|0*(?:60|62));/giu
const sanitizeString = (val: string): string => {
  let result = val
  let prev = ''
  while (prev !== result) {
    prev = result
    result = result
      .replace(SCRIPT_TAG_PATTERN, '')
      .replace(EVENT_HANDLER_PATTERN, '')
      .replace(JAVASCRIPT_PROTO_PATTERN, '')
      .replace(DATA_URI_SCRIPT_PATTERN, '')
      .replace(DANGEROUS_TAG_PATTERN, '')
      .replace(HTML_ENCODED_SCRIPT_PATTERN, '')
  }
  return result
}
const sanitizeRec = (data: Rec): Rec => {
  const result: Rec = {}
  for (const key of Object.keys(data)) {
    const v = data[key]
    if (typeof v === 'string') result[key] = sanitizeString(v)
    else if (Array.isArray(v)) {
      const arr: unknown[] = []
      for (const el of v)
        if (typeof el === 'string') arr.push(sanitizeString(el))
        else if (el && typeof el === 'object' && !Array.isArray(el)) arr.push(sanitizeRec(el as Rec))
        else arr.push(el)
      result[key] = arr
    } else if (v && typeof v === 'object' && !Array.isArray(v)) result[key] = sanitizeRec(v as Rec)
    else result[key] = v
  }
  return result
}
const createInputSanitize = <
  MCtx,
  CreateBeforeArgs extends { data: Rec },
  UpdateBeforeArgs extends { patch: Rec }
>(opts?: {
  fields?: string[]
}): Pick<MiddlewareLike<MCtx, Rec, CreateBeforeArgs, Rec, Rec, Rec, UpdateBeforeArgs>, 'beforeCreate' | 'beforeUpdate'> & {
  name: string
} => {
  const targetFields = opts?.fields ? new Set(opts.fields) : undefined
  return {
    beforeCreate: (_ctx, args) => {
      if (targetFields) {
        const result: Rec = { ...args.data }
        for (const f of targetFields) if (typeof result[f] === 'string') result[f] = sanitizeString(result[f])
        return result
      }
      return sanitizeRec(args.data)
    },
    beforeUpdate: (_ctx, args) => {
      if (targetFields) {
        const result: Rec = { ...args.patch }
        for (const f of targetFields) if (typeof result[f] === 'string') result[f] = sanitizeString(result[f])
        return result
      }
      return sanitizeRec(args.patch)
    },
    name: 'inputSanitize'
  }
}
export type { GlobalHooksLike, MiddlewareLike, Operation }
export { createComposeMiddleware, createInputSanitize, sanitizeRec, sanitizeString }
