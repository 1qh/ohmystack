type AnyApi = Record<string, Record<string, unknown>>

// biome-ignore lint/style/noProcessEnv: env detection
const GUARD_ACTIVE = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production',
  /** Finds a case-insensitive match for a module name. */
  findSuggestion = (modules: string[], name: string): string | undefined => {
    const lower = name.toLowerCase()
    for (const m of modules) if (m.toLowerCase() === lower) return m
  },
  /** Creates a proxy that validates api module access and suggests corrections. */
  makeGuardedProxy = <T extends AnyApi>(target: T, modules: string[]): T => {
    if (!GUARD_ACTIVE) return target
    const moduleSet = new Set(modules)
    return new Proxy(target, {
      get: (obj, prop) => {
        if (typeof prop !== 'string') return Reflect.get(obj, prop)
        if (moduleSet.has(prop)) return Reflect.get(obj, prop)
        const suggestion = findSuggestion(modules, prop),
          msg = suggestion
            ? `guardApi: api.${prop} does not exist. Did you mean api.${suggestion}?`
            : `guardApi: api.${prop} does not match any module in your convex/ directory. Valid modules: ${modules.join(', ')}`
        throw new Error(msg)
      }
    })
  },
  /** Guards an api object to catch typos in module names at runtime. */
  guardApi = <T extends AnyApi>(api: T, modules: string[]): T => makeGuardedProxy(api, modules)

export { guardApi }
