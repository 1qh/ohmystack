/** biome-ignore-all lint/suspicious/useAwait: promise-function-async conflict */
'use server'
import type { ProcessOptions } from '@a/shared/next/image'
import type { FunctionReference } from 'convex/server'
import type { NextRequest } from 'next/server'
import { applyTransforms, formatToMime, isImageType } from '@a/shared/next/image'
import { ConvexHttpClient } from 'convex/browser'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
interface ImageRouteConfig {
  convexUrl: string
  fileInfoQuery?: string
}
const fetchImage = async ({
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
  clientCache = new Map<string, ConvexHttpClient>(),
  getCachedClient = (url: string): ConvexHttpClient => {
    const existing = clientCache.get(url)
    if (existing) return existing
    const client = new ConvexHttpClient(url)
    clientCache.set(url, client)
    return client
  },
  makeImageRoute = async ({ convexUrl, fileInfoQuery = 'file:info' }: ImageRouteConfig) => {
    await Promise.resolve()
    const getClient = () => getCachedClient(convexUrl),
      opts = { getClient, queryRef: fileInfoQuery }
    return { GET: makeGet(opts), POST: makePost(opts) }
  }
export { makeImageRoute }
