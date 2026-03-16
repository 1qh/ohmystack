import { defineConfig } from 'lintmax'

export default defineConfig({
  biome: {
    ignorePatterns: [
      'apps/mobile/**/babel.config.js',
      'apps/mobile/**/global.css',
      'apps/mobile/**/metro.config.js',
      'apps/mobile/**/uniwind-env.d.ts',
      'apps/*/next-env.d.ts',
      'apps/*/*/next-env.d.ts',
      'apps/docs/.source',
      'mobile/convex/maestro',
      'packages/rnr/**',
      'packages/ui/**'
    ],
    overrides: [
      {
        disableLinter: true,
        includes: ['packages/rnr/**']
      },
      {
        disableLinter: true,
        includes: ['packages/ui/**']
      },
      {
        disableLinter: true,
        includes: ['**/generated/**', '**/_generated/**', '**/module_bindings/**']
      },
      {
        includes: ['apps/mobile/**'],
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
      'apps/mobile/**/babel.config.js',
      'apps/mobile/**/metro.config.js',
      'apps/mobile/**/uniwind-env.d.ts',
      'apps/mobile/**/uniwind-types.d.ts',
      'generated/',
      'mobile/convex/maestro/',
      'module_bindings/',
      'packages/rnr/',
      'packages/ui/',
      '.source/'
    ],
    overrides: [
      {
        files: ['apps/mobile/**/*.tsx', 'apps/mobile/**/*.ts'],
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
