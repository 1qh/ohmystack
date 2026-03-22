/** biome-ignore-all lint/suspicious/useAwait: Sharp returns thenable, not Promise */

import type { Sharp } from 'sharp'
type Format = 'jpeg' | 'png' | 'webp'
interface FormatOpts {
  contentType: string
  format: Format | undefined
  quality: number
}
interface ProcessOptions {
  compress?: { quality?: number }
  format?: Format
  resize?: { fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside'; height?: number; width?: number }
}
interface TransformOpts {
  contentType: string
  options: ProcessOptions | undefined
  pipeline: Sharp
  thumbnail: boolean
}
const IMAGE_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']),
  isImageType = (contentType: string): boolean => IMAGE_TYPES.has(contentType),
  formatToMime: Record<Format, string> = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp'
  },
  applyFormat = ({ contentType, format, pipeline, quality }: FormatOpts & { pipeline: Sharp }): Sharp => {
    if (format === 'jpeg') return pipeline.jpeg({ quality })
    if (format === 'png') return pipeline.png({ quality })
    if (format === 'webp') return pipeline.webp({ quality })
    const [, ext] = contentType.split('/')
    if (ext === 'jpeg' || ext === 'jpg') return pipeline.jpeg({ quality })
    if (ext === 'png') return pipeline.png({ quality })
    if (ext === 'webp') return pipeline.webp({ quality })
    return pipeline
  },
  applyTransforms = ({ contentType, options, pipeline, thumbnail }: TransformOpts): Sharp => {
    const DEFAULT_QUALITY = 80,
      THUMB_SIZE = 200,
      quality = options?.compress?.quality ?? DEFAULT_QUALITY
    if (thumbnail)
      return pipeline.resize({ fit: 'cover', height: THUMB_SIZE, width: THUMB_SIZE }).webp({ quality: DEFAULT_QUALITY })
    let result = pipeline
    if (options?.resize)
      result = result.resize({
        fit: options.resize.fit ?? 'cover',
        height: options.resize.height,
        width: options.resize.width
      })
    if (options?.format || options?.compress)
      result = applyFormat({ contentType, format: options.format, pipeline: result, quality })
    return result
  }
export type { Format, FormatOpts, ProcessOptions, TransformOpts }
export { applyFormat, applyTransforms, formatToMime, isImageType }
