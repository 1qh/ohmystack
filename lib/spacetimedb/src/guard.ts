// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
import { err } from './server/helpers'
type AnyApi = Record<string, Record<string, unknown>>
const GUARD_ACTIVE = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production',
  /** Finds a case-insensitive module name suggestion for guard errors. */
  findSuggestion = (modules: string[], name: string): string | undefined => {
    const lower = name.toLowerCase()
    for (const m of modules) if (m.toLowerCase() === lower) return m
  },
  /** Creates a proxy that throws descriptive errors for unknown module access.
   * @param target - API object to guard
   * @param modules - Allowed module names
   * @returns Proxy that validates module keys at runtime
   */
  makeGuardedProxy = <T extends AnyApi>(target: T, modules: string[]): T => {
    if (!GUARD_ACTIVE) return target
    const moduleSet = new Set(modules)
    return new Proxy(target, {
      get: (obj, prop) => {
        if (typeof prop !== 'string') return Reflect.get(obj, prop)
        if (moduleSet.has(prop)) return Reflect.get(obj, prop)
        const suggestion = findSuggestion(modules, prop),
          msg = suggestion
            ? `guardApi: module ${prop} does not exist. Did you mean ${suggestion}?`
            : `guardApi: module ${prop} does not match any reducer/table module. Valid modules: ${modules.join(', ')}`
        err('FORBIDDEN', { message: msg })
      }
    })
  },
  /** Wraps an API object with module-name guardrails in non-production builds.
   * @param api - API object keyed by module
   * @param modules - Valid module names
   * @returns Original API in production, guarded proxy otherwise
   */
  guardApi = <T extends AnyApi>(api: T, modules: string[]): T => makeGuardedProxy(api, modules)
export { guardApi }
