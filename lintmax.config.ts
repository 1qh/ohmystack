import { defineConfig } from 'lintmax'

export default defineConfig({
  biome: {
    ignorePatterns: [
      'expo/**/babel.config.js',
      'expo/**/global.css',
      'expo/**/metro.config.js',
      'expo/**/uniwind-env.d.ts',
      'expo/**/uniwind-types.d.ts',
      'web/*/*/next-env.d.ts',
      'doc/next-env.d.ts',
      'doc/.source',
      'mobile/convex/maestro',
      'lib/rnr/**',
      'lib/ui/**'
    ],
    overrides: [
      {
        disableLinter: true,
        includes: ['lib/rnr/**']
      },
      {
        disableLinter: true,
        includes: ['lib/ui/**']
      },
      {
        disableLinter: true,
        includes: ['**/generated/**', '**/_generated/**', '**/module_bindings/**']
      },
      {
        includes: ['expo/**'],
        rules: {
          'style/noProcessEnv': 'off'
        }
      },
      {
        includes: ['**/maestro/**'],
        rules: {
          'performance/noAwaitInLoops': 'off'
        }
      }
    ]
  },
  oxlint: {
    ignorePatterns: [
      '_generated/',
      'expo/**/babel.config.js',
      'expo/**/metro.config.js',
      'expo/**/uniwind-env.d.ts',
      'expo/**/uniwind-types.d.ts',
      'generated/',
      'mobile/convex/maestro/',
      'module_bindings/',
      'lib/rnr/',
      'lib/ui/',
      '.source/'
    ],
    overrides: [
      {
        files: ['expo/**/*.tsx', 'expo/**/*.ts'],
        rules: {
          'react/no-unstable-default-props': 'off',
          'react-perf/jsx-no-new-object-as-prop': 'off'
        }
      },
      {
        files: [
          '**/convex/blogProfile.ts',
          '**/convex/mobileAi.ts',
          '**/convex/orgProfile.ts',
          '**/convex/tokenUsage.ts',
          '**/convex/orchestratorNode.ts',
          '**/convex/agentsNode.ts',
          '**/convex/staleTaskCleanup.ts',
          '**/convex/webSearch.ts',
          '**/convex/rateLimit.ts'
        ],
        rules: {
          'unicorn/filename-case': 'off'
        }
      }
    ],
    rules: {
      'import/no-unassigned-import': 'off'
    }
  }
})
