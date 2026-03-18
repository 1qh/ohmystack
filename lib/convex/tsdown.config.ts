import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  dts: true,
  entry: [
    'src/index.ts',
    'src/server/index.ts',
    'src/zod.ts',
    'src/schema.ts',
    'src/retry.ts',
    'src/react/index.ts',
    'src/components/index.ts',
    'src/next/index.ts'
  ],
  external: [/^[^./]/u],
  format: 'esm',
  outDir: 'dist'
})
