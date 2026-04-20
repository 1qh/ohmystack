import { defineConfig, defineDocs } from 'fumadocs-mdx/config'
import remarkNoboil from './lib/remark-noboil'
export const docs = defineDocs({ dir: 'content/docs' })
export default defineConfig({
  mdxOptions: { remarkPlugins: [remarkNoboil] }
})
