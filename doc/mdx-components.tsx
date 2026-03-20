import type { MDXComponents } from 'mdx/types'

import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import defaultMdxComponents from 'fumadocs-ui/mdx'
const getMDXComponents = (components?: MDXComponents): MDXComponents => ({
  ...defaultMdxComponents,
  Tab,
  Tabs,
  ...components
})
export { getMDXComponents }
