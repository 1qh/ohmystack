import type { Metadata } from 'next'
import type { ComponentType } from 'react'
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page'
import { createRelativeLink } from 'fumadocs-ui/mdx'
import { notFound } from 'next/navigation'
import { source } from '@/lib/source'
import { getMDXComponents } from '@/mdx-components'
interface PageData {
  body: ComponentType<{ components?: Record<string, unknown> }>
  description?: string
  full?: boolean
  title: string
  toc: Parameters<typeof DocsPage>[0]['toc']
}
type SourcePage = ReturnType<typeof source.getPage> & { data: PageData }
const Page = async ({ params }: { params: Promise<{ slug?: string[] }> }) => {
  const parsedParams = await params
  const page = source.getPage(parsedParams.slug) as SourcePage | undefined
  if (!page) notFound()
  const Content = page.data.body
  return (
    <DocsPage full={page.data.full} toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <Content
          components={getMDXComponents({
            a: createRelativeLink(source, page)
          })}
        />
      </DocsBody>
    </DocsPage>
  )
}
const generateStaticParams = () => source.generateParams()
const generateMetadata = async ({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> => {
  const parsedParams = await params
  const page = source.getPage(parsedParams.slug) as SourcePage | undefined
  if (!page) notFound()
  return {
    description: page.data.description,
    title: page.data.title
  }
}
export default Page
export { generateMetadata, generateStaticParams }
