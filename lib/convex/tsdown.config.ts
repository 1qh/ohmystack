import { defineConfig } from 'tsdown'
export default defineConfig({
  clean: true,
  dts: false,
  entry: ['src/index.ts', 'src/zod.ts', 'src/retry.ts', 'src/schema.ts', 'src/eslint.ts', 'src/seed.ts', './src/cli.ts'],
  format: 'esm',
  outDir: 'dist'
})
