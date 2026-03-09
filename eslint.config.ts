import { eslint } from 'lintmax/eslint'

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
      files: [
        'apps/**/*.ts',
        'apps/**/*.tsx',
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
    }
  ],
  ignores: [
    '*.config.ts',
    'packages/be-convex/convex/**/*.test.ts',
    'packages/be-spacetimedb/module_bindings/**',
    'packages/ui/**'
  ],
  rules: {
    '@eslint-react/dom/no-dangerously-set-innerhtml': 'off',
    '@eslint-react/hooks-extra/no-direct-set-state-in-use-effect': 'off',
    '@next/next/no-img-element': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-magic-numbers': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/require-await': 'off',
    'jest/no-conditional-in-test': 'off',
    'no-await-in-loop': 'off',
    'no-magic-numbers': 'off',
    'react-hooks/preserve-manual-memoization': 'off',
    'react-hooks/set-state-in-effect': 'off',
    'react/no-danger': 'off',
    'react/no-unstable-nested-components': 'off'
  },
  tailwind: 'packages/ui/src/styles/globals.css'
})
