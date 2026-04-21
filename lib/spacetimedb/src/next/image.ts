// biome-ignore-all lint/suspicious/useAwait: async without await
'use server'
/* eslint-disable @typescript-eslint/require-await */
import type { ProcessOptions } from '@noboil/shared/next/image'
import type { NextRequest } from 'next/server'
import { applyTransforms, formatToMime, isImageType } from '@noboil/shared/next/image'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
interface ImageRouteConfig {
  fileInfoEndpoint?: string
  storageBaseUrl?: string
}
const isHttpUrl = (value: string) => value.startsWith('http://') || value.startsWith('https://')
const buildStorageUrl = ({ storageBaseUrl, storageId }: { storageBaseUrl: string; storageId: string }) => {
  const base = storageBaseUrl.endsWith('/') ? storageBaseUrl.slice(0, -1) : storageBaseUrl
  const key = storageId.startsWith('/') ? storageId.slice(1) : storageId
  return `${base}/${key}`
}
const resolveUrlByEndpoint = async ({ fileInfoEndpoint, storageId }: { fileInfoEndpoint: string; storageId: string }) => {
  const response = await fetch(fileInfoEndpoint, {
    body: JSON.stringify({ id: storageId }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  })
  const body = (await response.json().catch(() => ({ _parseError: true }))) as { _parseError?: boolean; url?: string }
  if (!response.ok)
    return { error: `File info endpoint returned HTTP ${response.status}`, status: response.status } as const
  if (body._parseError) return { error: 'File info endpoint returned non-JSON response', status: 502 } as const
  if (!body.url) return { error: 'File info endpoint response missing url field', status: 502 } as const
  return body.url
}
const fetchSourceUrl = async ({
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
}
const fetchImage = async ({
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
}
const makeGet =
  ({ fileInfoEndpoint, storageBaseUrl }: ImageRouteConfig) =>
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const sourceUrl = req.nextUrl.searchParams.get('url') ?? undefined
      const storageId = req.nextUrl.searchParams.get('id') ?? undefined
      const result = await fetchImage({ fileInfoEndpoint, sourceUrl, storageBaseUrl, storageId })
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
  }
const makePost =
  ({ fileInfoEndpoint, storageBaseUrl }: ImageRouteConfig) =>
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const body = (await req.json()) as {
        options?: ProcessOptions
        sourceUrl?: string
        storageId?: string
        storageUrl?: string
        thumbnail?: boolean
      }
      const sourceUrl = body.sourceUrl ?? body.storageUrl
      const result = await fetchImage({
        fileInfoEndpoint,
        sourceUrl,
        storageBaseUrl,
        storageId: body.storageId
      })
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
      const { buffer, contentType } = result
      const thumbnail = body.thumbnail ?? false
      const pipeline = applyTransforms({
        contentType,
        options: body.options,
        pipeline: sharp(buffer),
        thumbnail
      })
      const outputBuffer = await pipeline.toBuffer()
      const outputMime = thumbnail ? 'image/webp' : body.options?.format ? formatToMime[body.options.format] : contentType
      return new NextResponse(new Uint8Array(outputBuffer), {
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Type': outputMime }
      })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Processing failed' }, { status: 500 })
    }
  }
const makeImageRoute = async ({ fileInfoEndpoint, storageBaseUrl }: ImageRouteConfig) => ({
  GET: makeGet({ fileInfoEndpoint, storageBaseUrl }),
  POST: makePost({ fileInfoEndpoint, storageBaseUrl })
})
export { makeImageRoute }
