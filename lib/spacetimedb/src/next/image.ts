// biome-ignore-all lint/suspicious/useAwait: async without await
'use server'
/* eslint-disable @typescript-eslint/require-await */
import type { NextRequest } from 'next/server'
import type { Sharp } from 'sharp'

import { NextResponse } from 'next/server'
import sharp from 'sharp'
type Format = 'jpeg' | 'png' | 'webp'
interface FormatOpts {
  contentType: string
  format: Format | undefined
  quality: number
}
interface ImageRouteConfig {
  fileInfoEndpoint?: string
  storageBaseUrl?: string
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
  formatToMime: Record<Format, string> = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp'
  },
  isImageType = (contentType: string): boolean => IMAGE_TYPES.has(contentType),
  isHttpUrl = (value: string) => value.startsWith('http://') || value.startsWith('https://'),
  buildStorageUrl = ({ storageBaseUrl, storageId }: { storageBaseUrl: string; storageId: string }) => {
    const base = storageBaseUrl.endsWith('/') ? storageBaseUrl.slice(0, -1) : storageBaseUrl,
      key = storageId.startsWith('/') ? storageId.slice(1) : storageId
    return `${base}/${key}`
  },
  resolveUrlByEndpoint = async ({ fileInfoEndpoint, storageId }: { fileInfoEndpoint: string; storageId: string }) => {
    const response = await fetch(fileInfoEndpoint, {
        body: JSON.stringify({ id: storageId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      }),
      body = (await response.json().catch(() => ({ _parseError: true }))) as { _parseError?: boolean; url?: string }
    if (!response.ok)
      return { error: `File info endpoint returned HTTP ${response.status}`, status: response.status } as const
    if (body._parseError) return { error: 'File info endpoint returned non-JSON response', status: 502 } as const
    if (!body.url) return { error: 'File info endpoint response missing url field', status: 502 } as const
    return body.url
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
  },
  fetchSourceUrl = async ({
    fileInfoEndpoint,
    sourceUrl,
    storageBaseUrl,
    storageId
  }: {
    fileInfoEndpoint?: string
    sourceUrl?: string
    storageBaseUrl?: string
    storageId?: string
  }): Promise<string | { error: string; status: number }> => {
    if (sourceUrl && isHttpUrl(sourceUrl)) return sourceUrl
    if (storageId && isHttpUrl(storageId)) return storageId
    if (sourceUrl) return { error: 'sourceUrl must be an http(s) url', status: 400 }
    if (storageId && storageBaseUrl) return buildStorageUrl({ storageBaseUrl, storageId })
    if (storageId && fileInfoEndpoint) return resolveUrlByEndpoint({ fileInfoEndpoint, storageId })
    return { error: 'sourceUrl or storageId is required', status: 400 }
  },
  fetchImage = async ({
    fileInfoEndpoint,
    sourceUrl,
    storageBaseUrl,
    storageId
  }: {
    fileInfoEndpoint?: string
    sourceUrl?: string
    storageBaseUrl?: string
    storageId?: string
  }): Promise<{ buffer: Buffer; contentType: string } | { error: string; status: number }> => {
    const resolved = await fetchSourceUrl({ fileInfoEndpoint, sourceUrl, storageBaseUrl, storageId })
    if (typeof resolved !== 'string') return resolved
    const response = await fetch(resolved)
    if (!response.ok) return { error: 'Failed to fetch image', status: 500 }
    const contentType = response.headers.get('content-type') ?? ''
    if (!isImageType(contentType)) return { error: 'Not an image file', status: 400 }
    return { buffer: Buffer.from(await response.arrayBuffer()), contentType }
  },
  makeGet =
    ({ fileInfoEndpoint, storageBaseUrl }: ImageRouteConfig) =>
    async (req: NextRequest): Promise<NextResponse> => {
      try {
        const sourceUrl = req.nextUrl.searchParams.get('url') ?? undefined,
          storageId = req.nextUrl.searchParams.get('id') ?? undefined,
          result = await fetchImage({ fileInfoEndpoint, sourceUrl, storageBaseUrl, storageId })
        if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
        return new NextResponse(new Uint8Array(result.buffer), {
          headers: { 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Type': result.contentType }
        })
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to fetch image' },
          { status: 500 }
        )
      }
    },
  makePost =
    ({ fileInfoEndpoint, storageBaseUrl }: ImageRouteConfig) =>
    async (req: NextRequest): Promise<NextResponse> => {
      try {
        const body = (await req.json()) as {
            options?: ProcessOptions
            sourceUrl?: string
            storageId?: string
            storageUrl?: string
            thumbnail?: boolean
          },
          sourceUrl = body.sourceUrl ?? body.storageUrl,
          result = await fetchImage({
            fileInfoEndpoint,
            sourceUrl,
            storageBaseUrl,
            storageId: body.storageId
          })
        if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
        const { buffer, contentType } = result,
          thumbnail = body.thumbnail ?? false,
          pipeline = applyTransforms({
            contentType,
            options: body.options,
            pipeline: sharp(buffer),
            thumbnail
          }),
          /** biome-ignore lint/nursery/useAwaitThenable: sharp toBuffer returns Promise */
          outputBuffer = await pipeline.toBuffer(),
          outputMime = thumbnail ? 'image/webp' : body.options?.format ? formatToMime[body.options.format] : contentType
        return new NextResponse(new Uint8Array(outputBuffer), {
          headers: { 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Type': outputMime }
        })
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Processing failed' }, { status: 500 })
      }
    },
  makeImageRoute = async ({ fileInfoEndpoint, storageBaseUrl }: ImageRouteConfig) => ({
    GET: makeGet({ fileInfoEndpoint, storageBaseUrl }),
    POST: makePost({ fileInfoEndpoint, storageBaseUrl })
  })
export { makeImageRoute }
