type AnyApi = Record<string, Record<string, unknown>>
interface GuardConfig {
  label: string
  notFoundLabel?: string
  onError: (msg: string) => never | undefined
  suggestWithLabel?: boolean
}
// biome-ignore lint/style/noProcessEnv: env detection
const GUARD_ACTIVE = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
const findSuggestion = (modules: string[], name: string): string | undefined => {
  const lower = name.toLowerCase()
  for (const m of modules) if (m.toLowerCase() === lower) return m
}
const makeGuardedProxy = <T extends AnyApi>(target: T, modules: string[], config: GuardConfig): T => {
  if (!GUARD_ACTIVE) return target
  const moduleSet = new Set(modules)
  const prefix = config.suggestWithLabel === false ? '' : `${config.label}.`
  return new Proxy(target, {
    get: (obj, prop) => {
      if (typeof prop !== 'string') return Reflect.get(obj, prop)
      if (moduleSet.has(prop)) return Reflect.get(obj, prop)
      const suggestion = findSuggestion(modules, prop)
      const msg = suggestion
        ? `guardApi: ${config.label}.${prop} does not exist. Did you mean ${prefix}${suggestion}?`
        : `guardApi: ${config.label}.${prop} does not match any ${config.notFoundLabel ?? 'module'}. Valid modules: ${modules.join(', ')}`
      config.onError(msg)
    }
  })
}
const createGuardApi =
  (config: GuardConfig) =>
  <T extends AnyApi>(api: T, modules: string[]): T =>
    makeGuardedProxy(api, modules, config)
export type { AnyApi, GuardConfig }
export { createGuardApi }
