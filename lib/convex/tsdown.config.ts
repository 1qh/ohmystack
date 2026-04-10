import { defineConfig } from 'tsdown'
export default defineConfig({
  clean: true,
  dts: false,
  entry: [
    'src/index.ts',
    'src/zod.ts',
    'src/retry.ts',
    'src/schema.ts',
    'src/eslint.ts',
    'src/seed.ts',
    'src/cli.ts',
    'src/server/index.ts',
    'src/server/test.ts',
    'src/server/test-discover.ts',
    'src/react/index.ts',
    'src/components/index.ts',
    'src/next/index.ts'
  ],
  format: 'esm',
  noExternal: [/^@a\//],
  outDir: 'dist'
})
