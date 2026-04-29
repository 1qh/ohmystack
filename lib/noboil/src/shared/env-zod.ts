/** biome-ignore-all lint/style/noProcessEnv: env loader is the single allowed site */
import type { ZodObject, ZodRawShape, ZodType } from 'zod/v4'
const createEnv = <T extends ZodRawShape>(
  schema: ZodObject<T>
): { [K in keyof T]: T[K] extends ZodType<infer R> ? R : never } => {
  let cached: null | Record<string, unknown> = null
  return new Proxy(
    {},
    {
      get: (_, key: string) => {
        cached ??= schema.parse(process.env) as Record<string, unknown>
        return cached[key]
      }
    }
  ) as { [K in keyof T]: T[K] extends ZodType<infer R> ? R : never }
}
const createOptionalEnv = <T extends ZodRawShape>(
  schema: ZodObject<T>,
  defaults: Partial<{ [K in keyof T]: T[K] extends ZodType<infer R> ? R : never }> = {}
): { [K in keyof T]?: T[K] extends ZodType<infer R> ? R : never } => {
  const keys = new Set(Object.keys(schema.shape))
  return new Proxy(
    {},
    {
      get: (_, key: string) => {
        if (typeof key !== 'string') return
        if (!keys.has(key)) throw new Error(`env: unknown optional key '${key}'`)
        const raw = process.env[key]
        if (raw === undefined) return (defaults as Record<string, unknown>)[key]
        const shape = (
          schema.shape as unknown as Record<
            string,
            { safeParse: (v: unknown) => { data: unknown; success: true } | { success: false } }
          >
        )[key]
        if (!shape) return raw
        const parsed = shape.safeParse(raw)
        return parsed.success ? parsed.data : (defaults as Record<string, unknown>)[key]
      }
    }
  )
}
export { createEnv, createOptionalEnv }
