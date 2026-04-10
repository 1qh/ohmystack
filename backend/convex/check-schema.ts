import type { ZodObject } from 'zod/v4'
import { checkSchema } from '@noboil/convex/server'
import { base, children, owned } from './s'
checkSchema({
  ...base,
  ...Object.fromEntries(Object.entries(children).map(([k, c]) => [k, c.schema])),
  ...owned
} as Record<string, ZodObject>)
