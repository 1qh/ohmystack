import { loader } from 'fumadocs-core/source'
import { docs } from 'fumadocs-mdx:collections/server'
interface FumadocsCollection {
  toFumadocsSource: () => Parameters<typeof loader>[0]['source']
}
export const source = loader({
  baseUrl: '/docs',
  source: (docs as FumadocsCollection).toFumadocsSource()
})
