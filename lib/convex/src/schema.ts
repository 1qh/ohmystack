import type { ZodObject, ZodRawShape } from 'zod/v4'

import { zid } from 'convex-helpers/server/zod4'
import { array, object, string } from 'zod/v4'

import type { BaseSchema, OrgSchema, OwnedSchema, SchemaBrand, SingletonSchema } from './server/types'

import { typed } from './server/bridge'

/** Zod schema for a Convex storage file reference. */
const cvFile = () => zid('_storage').meta({ cv: 'file' as const }),
  /** Zod schema for an array of Convex storage file references. */
  cvFiles = () => array(cvFile()).meta({ cv: 'files' as const }),
  /** Defines a child table with a foreign key relationship to a parent table. */
  child = <
    const P extends string,
    const S extends ZodRawShape,
    const FK extends keyof S & string,
    PS extends ZodRawShape = ZodRawShape
  >(config: {
    foreignKey: FK
    index?: string
    parent: P
    parentSchema?: ZodObject<PS>
    schema: ZodObject<S>
  }): {
    foreignKey: FK
    index: string
    parent: P
    parentSchema?: ZodObject<PS>
    schema: ZodObject<S>
  } => ({
    ...config,
    index: config.index ?? `by_${config.parent}`
  }),
  /** Zod schema for organization metadata (name, slug, avatar). */
  orgSchema = object({
    avatarId: zid('_storage').nullable().optional(),
    name: string().min(1),
    slug: string()
      .min(1)
      .regex(/^[a-z0-9-]+$/u)
  }),
  /** Brands schemas with a type marker for compile-time safety. */
  brandSchemas = <B extends string, T extends Record<string, ZodObject<ZodRawShape>>>(
    schemas: T
  ): { [K in keyof T]: SchemaBrand<B> & T[K] } => typed(schemas),
  /** Creates owned schemas branded for use with crud(). */
  makeOwned = <T extends Record<string, ZodObject<ZodRawShape>>>(schemas: T) =>
    brandSchemas<'owned', T>(schemas) as {
      [K in keyof T]: OwnedSchema<T[K] extends ZodObject<infer S> ? S : ZodRawShape> & T[K]
    },
  /** Creates org-scoped schemas branded for use with orgCrud(). */
  makeOrgScoped = <T extends Record<string, ZodObject<ZodRawShape>>>(schemas: T) =>
    brandSchemas<'org', T>(schemas) as {
      [K in keyof T]: OrgSchema<T[K] extends ZodObject<infer S> ? S : ZodRawShape> & T[K]
    },
  /** Creates base schemas branded for use with cacheCrud(). */
  makeBase = <T extends Record<string, ZodObject<ZodRawShape>>>(schemas: T) =>
    brandSchemas<'base', T>(schemas) as {
      [K in keyof T]: BaseSchema<T[K] extends ZodObject<infer S> ? S : ZodRawShape> & T[K]
    },
  /** Creates singleton schemas branded for use with singletonCrud(). */
  makeSingleton = <T extends Record<string, ZodObject<ZodRawShape>>>(schemas: T) =>
    brandSchemas<'singleton', T>(schemas) as {
      [K in keyof T]: SingletonSchema<T[K] extends ZodObject<infer S> ? S : ZodRawShape> & T[K]
    }

export { child, cvFile, cvFiles, makeBase, makeOrgScoped, makeOwned, makeSingleton, orgSchema }
