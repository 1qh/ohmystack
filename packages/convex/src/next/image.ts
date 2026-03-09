/** biome-ignore-all lint/suspicious/useAwait: promise-function-async conflict */
'use server'
import type { FunctionReference } from 'convex/server'
import type { NextRequest } from 'next/server'
import type { Sharp } from 'sharp'

import { ConvexHttpClient } from 'convex/browser'
import { NextResponse } from 'next/server'
import sharp from 'sharp'

type Format = 'jpeg' | 'png' | 'webp'
interface FormatOpts {
  contentType: string
  format: Format | undefined
  quality: number
}
interface ImageRouteConfig {
  convexUrl: string
  fileInfoQuery?: string
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
  },
  fetchImage = async ({
    client,
    queryRef,
    storageId
  }: {
    client: ConvexHttpClient
    queryRef: string
    storageId: string
  }): Promise<{ buffer: Buffer; contentType: string } | { error: string; status: number }> => {
    const info = (await client.query(queryRef as unknown as FunctionReference<'query'>, { id: storageId })) as null | {
        url: string
      },
      url = info?.url
    if (!url) return { error: 'File not found', status: 404 }
    const response = await fetch(url)
    if (!response.ok) return { error: 'Failed to fetch image', status: 500 }
    const contentType = response.headers.get('content-type') ?? ''
    if (!isImageType(contentType)) return { error: 'Not an image file', status: 400 }
    return { buffer: Buffer.from(await response.arrayBuffer()), contentType }
  },
  makeGet =
    ({ getClient, queryRef }: { getClient: () => ConvexHttpClient; queryRef: string }) =>
    async (req: NextRequest): Promise<NextResponse> => {
      try {
        const storageId = req.nextUrl.searchParams.get('id')
        if (!storageId) return NextResponse.json({ error: 'id is required' }, { status: 400 })
        const result = await fetchImage({ client: getClient(), queryRef, storageId })
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
    ({ getClient, queryRef }: { getClient: () => ConvexHttpClient; queryRef: string }) =>
    async (req: NextRequest): Promise<NextResponse> => {
      try {
        const body = (await req.json()) as { options?: ProcessOptions; storageId: string; thumbnail?: boolean },
          { options, storageId, thumbnail } = body
        if (!storageId) return NextResponse.json({ error: 'storageId is required' }, { status: 400 })
        const result = await fetchImage({ client: getClient(), queryRef, storageId })
        if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
        const { buffer, contentType } = result,
          pipeline = applyTransforms({
            contentType,
            options,
            pipeline: sharp(buffer),
            thumbnail: thumbnail ?? false
          }),
          // biome-ignore lint/nursery/useAwaitThenable: sharp pipeline.toBuffer() returns a thenable
          outputBuffer = await pipeline.toBuffer(),
          outputMime = thumbnail ? 'image/webp' : options?.format ? formatToMime[options.format] : contentType
        return new NextResponse(new Uint8Array(outputBuffer), {
          headers: { 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Type': outputMime }
        })
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Processing failed' }, { status: 500 })
      }
    },
  makeImageRoute = async ({ convexUrl, fileInfoQuery = 'file:info' }: ImageRouteConfig) => {
    const getClient = () => new ConvexHttpClient(convexUrl),
      opts = { getClient, queryRef: fileInfoQuery }
    return { GET: makeGet(opts), POST: makePost(opts) }
  }

/** Creates a Next.js route handler for image processing with GET and POST methods. */
export { makeImageRoute }
