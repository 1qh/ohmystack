import { defineConfig, eslintImport } from 'lintmax'

const backendLintIgnoreFiles = [
    'backend/agent/convex/f.test.ts',
    'backend/convex/convex/edge.test.ts',
    'backend/convex/convex/f.test.ts',
    'backend/convex/convex/org-api.test.ts'
  ],
  tailwindUnknownClassIgnore = [
    'group',
    'peer',
    'nodrag',
    'nopan',
    'nowheel',
    'not-prose',
    'is-user',
    'is-assistant',
    'is-user:dark',
    'animated',
    'node-container',
    'origin-top-center',
    'toaster'
  ]

export default defineConfig({
  biome: {
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
    append: [
      {
        files: ['**/*.ts', '**/*.tsx'],
        rules: {
          'better-tailwindcss/no-unknown-classes': [
            'error',
            {
              ignore: [...tailwindUnknownClassIgnore]
            }
          ]
        }
      },
      eslintImport({
        files: ['backend/convex/**/*.ts', 'backend/convex/**/*.tsx'],
        from: '@noboil/convex/eslint',
        name: 'recommended'
      }),
      eslintImport({
        files: ['backend/spacetimedb/**/*.ts', 'backend/spacetimedb/**/*.tsx'],
        from: '@noboil/spacetimedb/eslint',
        name: 'recommended'
      }),
      {
        files: [
          'backend/convex/**/*.ts',
          'backend/convex/**/*.tsx',
          'backend/spacetimedb/**/*.ts',
          'backend/spacetimedb/**/*.tsx'
        ],
        ignores: ['**/env.ts'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              importNames: ['env'],
              message: "Use `import env from '~/env'` instead to ensure validated types.",
              name: 'process'
            }
          ],
          'no-restricted-properties': [
            'error',
            {
              message: "Use `import env from '~/env'` instead to ensure validated types.",
              object: 'process',
              property: 'env'
            }
          ]
        }
      },
      {
        files: [
          'backend/convex/**/*.test.ts',
          'backend/convex/**/*.test.tsx',
          'backend/spacetimedb/**/*.test.ts',
          'backend/spacetimedb/**/*.test.tsx'
        ],
        rules: {
          '@typescript-eslint/require-await': 'off'
        }
      }
    ],
    ignores: [...backendLintIgnoreFiles]
  },
  ignores: ['**/.source/**', 'lib/rnr/**', 'lib/ui/**', 'web/*/*/next-env.d.ts', 'doc/next-env.d.ts'],
  oxlint: {
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
  },
  tailwind: 'lib/ui/src/styles/globals.css'
})
