interface PluginBundleOptions {
  pluginName: string
  rules: { [key: string]: unknown }
}

const createRecommendedRules = (pluginName: string): { [key: string]: 'error' | 'warn' } => ({
  [`${pluginName}/api-casing`]: 'error',
  [`${pluginName}/consistent-crud-naming`]: 'error',
  [`${pluginName}/discovery-check`]: 'warn',
  [`${pluginName}/form-field-exists`]: 'error',
  [`${pluginName}/form-field-kind`]: 'warn',
  [`${pluginName}/no-duplicate-crud`]: 'error',
  [`${pluginName}/no-empty-search-config`]: 'error',
  [`${pluginName}/no-raw-fetch-in-server-component`]: 'warn',
  [`${pluginName}/no-unlimited-file-size`]: 'warn',
  [`${pluginName}/no-unprotected-mutation`]: 'warn',
  [`${pluginName}/no-unsafe-api-cast`]: 'warn',
  [`${pluginName}/prefer-useList`]: 'warn',
  [`${pluginName}/prefer-useOrgQuery`]: 'warn',
  [`${pluginName}/require-connection`]: 'error',
  [`${pluginName}/require-error-boundary`]: 'warn',
  [`${pluginName}/require-rate-limit`]: 'warn'
})

const createEslintPluginBundle = ({ pluginName, rules }: PluginBundleOptions) => {
  const plugin = { rules },
    recommended = {
      files: ['**/*.ts', '**/*.tsx'],
      plugins: {
        [pluginName]: plugin
      },
      rules: createRecommendedRules(pluginName)
    }
  return { plugin, recommended, rules }
}

export { createEslintPluginBundle }
