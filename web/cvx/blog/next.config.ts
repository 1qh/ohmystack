import { createNextConfig } from '@a/fe/next-config'

export default createNextConfig({
  experimental: { serverActions: { bodySizeLimit: '100mb' } },
  imageDomains: ['*'],
  imgSrc: ['https://images.unsplash.com']
})
