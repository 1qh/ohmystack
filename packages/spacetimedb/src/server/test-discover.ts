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
  DEFAULT_MODULE_NAME = '@ohmystack/spacetimedb',
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
      moduleName = options?.moduleName ?? DEFAULT_MODULE_NAME,
      response = await fetch(`${httpUrl}/v1/database/${moduleName}/schema?version=9`),
      parsed = await parseSchemaResponse(response)
    return {
      reducers: pickNames(parsed.reducers),
      tables: pickNames(parsed.tables)
    }
  }

export { discoverModules }
