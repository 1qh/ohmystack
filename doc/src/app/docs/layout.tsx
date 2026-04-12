import type { ReactNode } from 'react'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
/* oxlint-disable jsx-no-new-object-as-prop */
import { source } from '@/lib/source'
const Layout = ({ children }: { children: ReactNode }) => (
  <DocsLayout nav={{ title: 'noboil' }} tree={source.getPageTree()}>
    {children}
  </DocsLayout>
)
export default Layout
