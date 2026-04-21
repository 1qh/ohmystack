import { defineConfig } from 'tsdown'
export default defineConfig({
  clean: true,
  dts: false,
  entry: [
    'src/cli.ts',
    'src/constants.ts',
    'src/docs-gen.ts',
    'src/eslint.ts',
    'src/guard.ts',
    'src/retry.ts',
    'src/schema-utils.ts',
    'src/seed.ts',
    'src/viz.ts',
    'src/zod.ts',
    'src/next/image.ts',
    'src/react/devtools-panel.tsx',
    'src/react/schema-playground.tsx',
    'src/components/fields.tsx',
    'src/components/file-utils.ts'
  ],
  format: 'esm',
  outDir: 'dist'
})
