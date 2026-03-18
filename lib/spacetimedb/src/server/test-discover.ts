interface DiscoverModulesOptions {
  httpUrl?: string
  moduleName?: string
}

interface DiscoverModulesResult {
  reducers: string[]
  tables: string[]
}

interface SchemaResponse {
  reducers?: { name?: string }[]
  tables?: { name?: string }[]
}

const DEFAULT_HTTP_URL = 'http://localhost:3000',
  getEnv = (key: string) => {
    const processRef = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    return processRef?.env?.[key]
  },
  resolveModuleName = (moduleName?: string) =>
    moduleName ?? getEnv('SPACETIMEDB_MODULE_NAME') ?? getEnv('NEXT_PUBLIC_SPACETIMEDB_MODULE_NAME'),
  ensureModuleName = (moduleName?: string): string => {
    if (!moduleName) throw new Error('SPACETIMEDB_MODULE_NAME is required in discoverModules options or env')
    return moduleName
  },
  parseSchemaResponse = async (response: Response): Promise<SchemaResponse> => {
    const text = await response.text()
    if (!response.ok) {
      const message = text.trim().length > 0 ? text : response.statusText
      throw new Error(`DISCOVER_MODULES_FAILED: ${message}`)
    }
    return JSON.parse(text) as SchemaResponse
  },
  pickNames = (rows?: { name?: string }[]): string[] => {
    const names: string[] = []
    for (const row of rows ?? []) {
      const { name } = row
      if (name) names.push(name)
    }
    return names
  },
  discoverModules = async (options?: DiscoverModulesOptions): Promise<DiscoverModulesResult> => {
    const httpUrl = options?.httpUrl ?? DEFAULT_HTTP_URL,
      moduleName = resolveModuleName(options?.moduleName),
      resolvedModuleName = ensureModuleName(moduleName),
      response = await fetch(`${httpUrl}/v1/database/${resolvedModuleName}/schema?version=9`),
      parsed = await parseSchemaResponse(response)
    return {
      reducers: pickNames(parsed.reducers),
      tables: pickNames(parsed.tables)
    }
  }

export { discoverModules }
