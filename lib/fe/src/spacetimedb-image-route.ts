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
  ],
  BRACKET_OPEN = /^\[/u,
  BRACKET_CLOSE = /\]$/u,
  isPrivateHostname = (hostname: string): boolean => {
    if (hostname === 'localhost' || hostname === '[::1]') return true
    const bare = hostname.replace(BRACKET_OPEN, '').replace(BRACKET_CLOSE, '')
    for (const pattern of PRIVATE_IP_PATTERNS) if (pattern.test(bare)) return true
    return false
  },
  allowedProtocol = (value: string) => {
    try {
      const parsed = new URL(value)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  },
  allowedHost = (value: string): boolean => {
    try {
      const parsed = new URL(value)
      return !isPrivateHostname(parsed.hostname)
    } catch {
      return false
    }
  },
  fetchRemote = async (url: string) => {
    const response = await fetch(url)
    if (!response.ok) return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 })
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream',
      body = new Uint8Array(await response.arrayBuffer())
    return new NextResponse(body, {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': contentType
      }
    })
  },
  /** biome-ignore lint/suspicious/useAwait: promise-function-async compatibility */
  GET = async (request: NextRequest) => {
    const url = request.nextUrl.searchParams.get('url')
    if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })
    if (!allowedProtocol(url)) return NextResponse.json({ error: 'url must be http or https' }, { status: 400 })
    if (!allowedHost(url)) return NextResponse.json({ error: 'url points to a private/internal address' }, { status: 403 })
    return fetchRemote(url)
  },
  POST = async (request: NextRequest) => {
    const body = (await request.json()) as ImagePostBody,
      url = typeof body.url === 'string' ? body.url : ''
    if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })
    if (!allowedProtocol(url)) return NextResponse.json({ error: 'url must be http or https' }, { status: 400 })
    if (!allowedHost(url)) return NextResponse.json({ error: 'url points to a private/internal address' }, { status: 403 })
    return fetchRemote(url)
  }
export { GET, POST }
