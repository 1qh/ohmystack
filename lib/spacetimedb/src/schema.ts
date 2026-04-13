/* eslint-disable @typescript-eslint/no-unused-vars */
import type { ZodObject, ZodRawShape } from 'zod/v4'
import { validateSchemas } from '@a/shared/zod'
import { array, object, string } from 'zod/v4'
import type { BaseSchema, OrgDefSchema, OrgSchema, OwnedSchema, SchemaBrand, SingletonSchema } from './server/types'
import { typed } from './server/bridge'
interface ChildEntry {
  foreignKey: string
  parent: string
  schema: unknown
}
interface ChildFn {
  <const P extends string, S extends ZodRawShape>(
    parent: P,
    def: ZodObject<S>
  ): {
    foreignKey: `${P}Id`
    index: string
    parent: P
    schema: ZodObject<S>
  }
  <
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
  }
}
/** Creates a file-id schema annotated for noboil file inputs. */
const file = () =>
  string()
    .min(1)
    .meta({ nb: 'file' as const })
const files = () => array(file()).meta({ nb: 'files' as const })
const child: ChildFn = (configOrParent: Record<string, unknown> | string, childSchema?: ZodObject) => {
  if (typeof configOrParent === 'string')
    return {
      foreignKey: `${configOrParent}Id`,
      index: `by_${configOrParent}`,
      parent: configOrParent,
      schema: childSchema
    } as never
  const config = configOrParent as { index?: string; parent: string }
  return { ...configOrParent, index: config.index ?? `by_${config.parent}` } as never
}
/** Default organization schema used by org helpers. */
const orgSchema = object({
  avatarId: string().min(1).nullable().optional(),
  name: string().min(1),
  slug: string()
    .min(1)
    .regex(/^[a-z0-9-]+$/u)
})
const brandSchemas = <B extends string, T extends Record<string, ZodObject>>(
  brand: B,
  schemas: T
): { [K in keyof T]: SchemaBrand<B> & T[K] } => {
  const keys = Object.keys(schemas)
  for (const key of keys) {
    const schema = schemas[key]
    if (schema)
      Object.defineProperty(schema as unknown as { __bs?: B }, '__bs', {
        configurable: true,
        enumerable: false,
        value: brand
      })
  }
  return typed(schemas)
}
const makeOwned = <T extends Record<string, ZodObject>>(schemas: T) =>
  brandSchemas('owned', schemas) as {
    [K in keyof T]: OwnedSchema<T[K] extends ZodObject<infer S, infer _Config> ? S : ZodRawShape> & T[K]
  }
const makeOrgScoped = <T extends Record<string, ZodObject>>(schemas: T) =>
  brandSchemas('org', schemas) as {
    [K in keyof T]: OrgSchema<T[K] extends ZodObject<infer S, infer _Config> ? S : ZodRawShape> & T[K]
  }
const makeOrg = <T extends Record<string, ZodObject>>(schemas: T) =>
  brandSchemas('orgDef', schemas) as {
    [K in keyof T]: OrgDefSchema<T[K] extends ZodObject<infer S, infer _Config> ? S : ZodRawShape> & T[K]
  }
const makeBase = <T extends Record<string, ZodObject>>(schemas: T) =>
  brandSchemas('base', schemas) as {
    [K in keyof T]: BaseSchema<T[K] extends ZodObject<infer S, infer _Config> ? S : ZodRawShape> & T[K]
  }
const makeSingleton = <T extends Record<string, ZodObject>>(schemas: T) =>
  brandSchemas('singleton', schemas) as {
    [K in keyof T]: SingletonSchema<T[K] extends ZodObject<infer S, infer _Config> ? S : ZodRawShape> & T[K]
  }
const mergeInto = (target: Record<string, unknown>, source: Record<string, unknown>) => {
  const keys = Object.keys(source)
  for (const key of keys) target[key] = source[key]
}
const schema = <T extends SchemaConfig>(config: T): SchemaResult<T> => {
  const all: Record<string, unknown> = {}
  for (const cat of [config.owned, config.orgScoped, config.org, config.base, config.singleton])
    if (cat) for (const [k, v] of Object.entries(cat)) all[k] = v
  if (config.children) for (const [k, v] of Object.entries(config.children)) all[k] = v
  validateSchemas(all)
  const result: Record<string, unknown> = {}
  if (config.owned) mergeInto(result, makeOwned(config.owned))
  if (config.orgScoped) mergeInto(result, makeOrgScoped(config.orgScoped))
  if (config.org) mergeInto(result, makeOrg(config.org))
  if (config.base) mergeInto(result, makeBase(config.base))
  if (config.singleton) mergeInto(result, makeSingleton(config.singleton))
  if (config.children) mergeInto(result, config.children)
  for (const name of Object.keys(result))
    Object.defineProperty(result[name] as object, '__name', {
      configurable: false,
      enumerable: false,
      value: name,
      writable: false
    })
  return typed(result)
}
interface Named<N extends string> {
  readonly __name: N
}
interface SchemaConfig {
  base?: Record<string, ZodObject>
  children?: Record<string, ChildEntry>
  org?: Record<string, ZodObject>
  orgScoped?: Record<string, ZodObject>
  owned?: Record<string, ZodObject>
  singleton?: Record<string, ZodObject>
}
type SchemaResult<T extends SchemaConfig> = (NonNullable<T['base']> extends infer O extends Record<string, ZodObject>
  ? { [K in keyof O]: BaseSchema<O[K] extends ZodObject<infer S> ? S : ZodRawShape> & Named<K & string> & O[K] }
  : unknown) &
  (NonNullable<T['children']> extends infer C extends Record<string, ChildEntry>
    ? { [K in keyof C]: C[K] & Named<K & string> }
    : unknown) &
  (NonNullable<T['org']> extends infer O extends Record<string, ZodObject>
    ? { [K in keyof O]: Named<K & string> & O[K] & OrgDefSchema<O[K] extends ZodObject<infer S> ? S : ZodRawShape> }
    : unknown) &
  (NonNullable<T['orgScoped']> extends infer O extends Record<string, ZodObject>
    ? { [K in keyof O]: Named<K & string> & O[K] & OrgSchema<O[K] extends ZodObject<infer S> ? S : ZodRawShape> }
    : unknown) &
  (NonNullable<T['owned']> extends infer O extends Record<string, ZodObject>
    ? { [K in keyof O]: Named<K & string> & O[K] & OwnedSchema<O[K] extends ZodObject<infer S> ? S : ZodRawShape> }
    : unknown) &
  (NonNullable<T['singleton']> extends infer O extends Record<string, ZodObject>
    ? { [K in keyof O]: Named<K & string> & O[K] & SingletonSchema<O[K] extends ZodObject<infer S> ? S : ZodRawShape> }
    : unknown)
export { child, file, files, makeBase, makeOrg, makeOrgScoped, makeOwned, makeSingleton, orgSchema, schema }
