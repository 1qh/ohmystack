import { defineConfig, eslintImport } from 'lintmax'
const backendLintIgnoreFiles = [
  'backend/agent/convex/f.test.ts',
  'backend/convex/convex/edge.test.ts',
  'backend/convex/convex/f.test.ts',
  'backend/convex/convex/org-api.test.ts'
]
const tailwindUnknownClassIgnore = [
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
  'toaster',
  'text-destructive-foreground',
  'bg-destructive-foreground'
]
export default defineConfig({
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
        files: ['backend/convex/convex/**/*.ts', 'backend/convex/convex/**/*.tsx'],
        from: '@noboil/convex/eslint',
        name: 'recommended'
      }),
      eslintImport({
        files: ['backend/spacetimedb/src/**/*.ts'],
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
  ignores: ['**/.source/**', 'readonly/ui/**', 'web/*/*/next-env.d.ts', 'doc/next-env.d.ts'],
  oxlint: {
    overrides: [
      {
        files: [
          '**/convex/blogProfile.ts',
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
  tailwind: 'readonly/ui/src/styles/globals.css'
})
