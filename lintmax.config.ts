import { defineConfig } from 'lintmax'
export default defineConfig({
  biome: {
    ignores: [
      'expo/**/uniwind-env.d.ts',
      'expo/**/uniwind-types.d.ts',
      'web/*/*/next-env.d.ts',
      'doc/next-env.d.ts',
      'doc/.source',
      'lib/ui/**',
      '**/generated/**',
      '**/_generated/**',
      '**/module_bindings/**'
    ],
    overrides: [
      {
        includes: ['expo/**'],
        off: ['style/noProcessEnv']
      },
      {
        includes: ['**/maestro/**'],
        off: ['performance/noAwaitInLoops']
      }
    ]
  },
  eslint: {
    ignores: [
      'backend/agent/convex/f.test.ts',
      'backend/convex/convex/edge.test.ts',
      'backend/convex/convex/f.test.ts',
      'backend/convex/convex/org-api.test.ts'
    ]
  },
  ignores: [
    '**/.source/**',
    '**/_generated/**',
    '**/generated/**',
    '**/module_bindings/**',
    'lib/rnr/**',
    'lib/ui/**',
    'web/*/*/next-env.d.ts',
    'doc/next-env.d.ts',
    'expo/**/uniwind-env.d.ts',
    'expo/**/uniwind-types.d.ts'
  ],
  oxlint: {
    ignores: [
      '_generated/',
      'expo/**/uniwind-env.d.ts',
      'expo/**/uniwind-types.d.ts',
      'generated/',
      'module_bindings/',
      'lib/ui/',
      '.source/'
    ],
    overrides: [
      {
        files: ['expo/**/*.tsx', 'expo/**/*.ts'],
        off: ['react/no-unstable-default-props', 'react-perf/jsx-no-new-object-as-prop']
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
        off: ['unicorn/filename-case']
      }
    ]
  }
})
