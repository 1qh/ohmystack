import { createNextConfig } from '@a/fe/spacetimedb-next-config'

export default createNextConfig({
  experimental: { serverActions: { bodySizeLimit: '100mb' } },
  imageDomains: ['*'],
  imgSrc: ['https://images.unsplash.com']
})
