/** biome-ignore-all lint/performance/noAwaitInLoops: sequential stream read */
/* eslint-disable no-await-in-loop */
/* oxlint-disable no-await-in-loop */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
interface ImagePostBody {
  url?: string
}
const PRIVATE_IP_PATTERNS = [
  /^127\./u,
  /^10\./u,
  /^172\.(?:1[6-9]|2\d|3[01])\./u,
  /^192\.168\./u,
  /^169\.254\./u,
  /^0\./u,
  /^::1$/u,
  /^fc00:/iu,
  /^fd/iu,
  /^fe80:/iu
]
const BRACKET_OPEN = /^\[/u
const BRACKET_CLOSE = /\]$/u
const isPrivateHostname = (hostname: string): boolean => {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const bare = hostname.replace(BRACKET_OPEN, '').replace(BRACKET_CLOSE, '')
  for (const pattern of PRIVATE_IP_PATTERNS) if (pattern.test(bare)) return true
  return false
}
const allowedProtocol = (value: string) => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
const allowedHost = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    return !isPrivateHostname(parsed.hostname)
  } catch {
    return false
  }
}
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024
const fetchRemote = async (url: string) => {
  const response = await fetch(url, { redirect: 'manual' })
  if (!response.ok) return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 })
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > MAX_RESPONSE_SIZE)
    return NextResponse.json({ error: 'Response too large' }, { status: 413 })
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
  const reader = response.body?.getReader()
  if (!reader) return NextResponse.json({ error: 'No response body' }, { status: 502 })
  const chunks: Uint8Array[] = []
  let totalSize = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    totalSize += value.byteLength
    if (totalSize > MAX_RESPONSE_SIZE) {
      reader.cancel()
      return NextResponse.json({ error: 'Response too large' }, { status: 413 })
    }
    chunks.push(value)
  }
  const body = new Uint8Array(totalSize)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new NextResponse(body, {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': contentType
    }
  })
}
/** biome-ignore lint/suspicious/useAwait: promise-function-async compatibility */
const GET = async (request: NextRequest) => {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })
  if (!allowedProtocol(url)) return NextResponse.json({ error: 'url must be http or https' }, { status: 400 })
  if (!allowedHost(url)) return NextResponse.json({ error: 'url points to a private/internal address' }, { status: 403 })
  return fetchRemote(url)
}
const POST = async (request: NextRequest) => {
  const body = (await request.json()) as ImagePostBody
  const url = typeof body.url === 'string' ? body.url : ''
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })
  if (!allowedProtocol(url)) return NextResponse.json({ error: 'url must be http or https' }, { status: 400 })
  if (!allowedHost(url)) return NextResponse.json({ error: 'url points to a private/internal address' }, { status: 403 })
  return fetchRemote(url)
}
export { GET, POST }
