import { eslint } from 'lintmax/eslint'
import { recommended as convexRecommended } from '@noboil/convex/eslint'
import { recommended as spacetimeRecommended } from '@noboil/spacetimedb/eslint'

export default eslint({
  append: [
    {
      files: ['apps/**/*.test.ts'],
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
      files: ['packages/be-convex/**/*.ts', 'packages/be-convex/**/*.tsx']
    },
    {
      ...spacetimeRecommended,
      files: ['packages/be-spacetimedb/**/*.ts', 'packages/be-spacetimedb/**/*.tsx']
    },
    {
      files: [
        'apps/**/src/**/*.ts',
        'apps/**/src/**/*.tsx',
        'packages/be-convex/**/*.ts',
        'packages/be-spacetimedb/**/*.ts',
        'packages/be-convex/**/*.tsx',
        'packages/be-spacetimedb/**/*.tsx'
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
        'packages/be-convex/**/*.test.ts',
        'packages/be-convex/**/*.test.tsx',
        'packages/be-spacetimedb/**/*.test.ts',
        'packages/be-spacetimedb/**/*.test.tsx'
      ],
      rules: {
        '@typescript-eslint/require-await': 'off'
      }
    }
  ],
  ignores: [
    '**/*.config.ts',
    '**/*.config.mjs',
    'packages/be-agent/convex/f.test.ts',
    'packages/ui/**',
    '**/.source/**',
    '**/_generated/**',
    '**/generated/**',
    '**/module_bindings/**'
  ],
  rules: {
    '@typescript-eslint/no-magic-numbers': 'off',
    'no-magic-numbers': 'off'
  },
  tailwind: 'packages/ui/src/styles/globals.css'
})
