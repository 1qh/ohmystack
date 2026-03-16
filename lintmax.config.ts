import { defineConfig } from 'lintmax'

export default defineConfig({
  biome: {
    ignorePatterns: ['mobile/convex/maestro', 'apps/*/next-env.d.ts', 'apps/docs/.source', 'packages/ui/**'],
    overrides: [
      {
        disableLinter: true,
        includes: ['packages/ui/**']
      },
      {
        disableLinter: true,
        includes: ['**/generated/**', '**/_generated/**', '**/module_bindings/**']
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
      'generated/',
      'module_bindings/',
      'mobile/convex/maestro/',
      'packages/ui/',
      '.source/'
    ],
    overrides: [
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
