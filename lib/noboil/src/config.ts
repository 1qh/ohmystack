/** biome-ignore-all lint/performance/noAwaitInLoops: sequential config file probe */
/* oxlint-disable eslint(no-await-in-loop) */
/* eslint-disable no-await-in-loop */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
interface AddContext {
  db: 'convex' | 'spacetimedb'
  fields: { name: string; optional: boolean; type: string }[]
  name: string
  parent: string
  type: string
}
interface CustomFieldType {
  convex: string
  description?: string
  stdb: string
}
interface NoboilConfig {
  fieldTypes?: Record<string, CustomFieldType>
  hooks?: {
    afterAdd?: (ctx: AddContext) => Promise<void> | void
    beforeAdd?: (ctx: AddContext) => Promise<void> | void
  }
}
const defineConfig = (config: NoboilConfig): NoboilConfig => config
const CONFIG_NAMES = ['noboil.config.ts', 'noboil.config.mts', 'noboil.config.js', 'noboil.config.mjs']
const loadConfig = async (cwd: string): Promise<NoboilConfig | null> => {
  for (const name of CONFIG_NAMES) {
    const p = join(cwd, name)
    if (existsSync(p))
      try {
        const mod = (await import(pathToFileURL(p).href)) as { default?: NoboilConfig }
        return mod.default ?? null
      } catch {
        return null
      }
  }
  return null
}
export type { AddContext, CustomFieldType, NoboilConfig }
export { defineConfig, loadConfig }
