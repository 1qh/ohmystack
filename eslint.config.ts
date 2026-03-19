import { eslint } from 'lintmax/eslint'
import { recommended as convexRecommended } from '@noboil/convex/eslint'
import { recommended as spacetimeRecommended } from '@noboil/spacetimedb/eslint'

export default eslint({
  append: [
    {
      files: ['web/**/*.test.ts', 'expo/**/*.test.ts'],
      plugins: {
        jest: {
          rules: {
            'no-conditional-in-test': {
              create: () => ({}),
              meta: {
                docs: { description: 'noop compatibility rule' },
                schema: [],
                type: 'problem'
              }
            }
          }
        }
      }
    },
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        'better-tailwindcss/no-unknown-classes': [
          'error',
          {
            ignore: [
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
          }
        ]
      }
    },
    {
      ...convexRecommended,
      files: ['backend/convex/**/*.ts', 'backend/convex/**/*.tsx']
    },
    {
      ...spacetimeRecommended,
      files: ['backend/spacetimedb/**/*.ts', 'backend/spacetimedb/**/*.tsx']
    },
    {
      files: [
        'web/**/src/**/*.ts',
        'web/**/src/**/*.tsx',
        'expo/**/src/**/*.ts',
        'expo/**/src/**/*.tsx',
        'backend/convex/**/*.ts',
        'backend/spacetimedb/**/*.ts',
        'backend/convex/**/*.tsx',
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
  ignores: [
    '**/*.config.ts',
    '**/*.config.mjs',
    'backend/agent/convex/f.test.ts',
    'backend/convex/convex/edge.test.ts',
    'backend/convex/convex/f.test.ts',
    'backend/convex/convex/org-api.test.ts',
    'expo/**/babel.config.js',
    'expo/**/metro.config.js',
    'expo/**/uniwind-env.d.ts',
    'expo/**/uniwind-types.d.ts',
    'doc/**',
    'lib/rnr/**',
    'lib/ui/**',
    '**/.source/**',
    '**/_generated/**',
    '**/generated/**',
    '**/module_bindings/**'
  ],
  tailwind: 'lib/ui/src/styles/globals.css'
})
