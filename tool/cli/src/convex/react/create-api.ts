'use client'
import type { FunctionReference } from 'convex/server'
import type { ConvexCrudRefs } from './use-crud'
interface CrudEndpoints {
  auth?: { list: FunctionReference<'query'>; read: FunctionReference<'query'> }
  create: FunctionReference<'mutation'>
  pub?: { list: FunctionReference<'query'>; read: FunctionReference<'query'> }
  rm: FunctionReference<'mutation'>
  update: FunctionReference<'mutation'>
}
const createApi = <T extends Record<string, CrudEndpoints>>(endpoints: T): { [K in keyof T]: ConvexCrudRefs } => {
  const api: Record<string, ConvexCrudRefs> = {}
  for (const [name, ep] of Object.entries(endpoints))
    api[name] = {
      create: ep.create,
      list: ep.pub?.list ?? ep.auth?.list ?? (undefined as never),
      rm: ep.rm,
      update: ep.update
    }
  return api as { [K in keyof T]: ConvexCrudRefs }
}
export { createApi }
