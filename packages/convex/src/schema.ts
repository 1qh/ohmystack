import type { ZodObject, ZodRawShape } from 'zod/v4'

import { zid } from 'convex-helpers/server/zod4'
import { array, object, string } from 'zod/v4'

import type { BaseSchema, OrgSchema, OwnedSchema, SchemaBrand, SingletonSchema } from './server/types'

import { typed } from './server/bridge'

  cvFiles = () => array(cvFile()).meta({ cv: 'files' as const }),
  orgSchema = object({
    avatarId: zid('_storage').nullable().optional(),
    name: string().min(1),
    slug: string()
      .min(1)
      .regex(/^[a-z0-9-]+$/u)
  }),
  makeOwned = <T extends Record<string, ZodObject<ZodRawShape>>>(schemas: T) =>
    brandSchemas<'owned', T>(schemas) as {
      [K in keyof T]: OwnedSchema<T[K] extends ZodObject<infer S> ? S : ZodRawShape> & T[K]
    },
  makeBase = <T extends Record<string, ZodObject<ZodRawShape>>>(schemas: T) =>
    brandSchemas<'base', T>(schemas) as {
      [K in keyof T]: BaseSchema<T[K] extends ZodObject<infer S> ? S : ZodRawShape> & T[K]
    },
