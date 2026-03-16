import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'

interface ImagePostBody {
  url?: string
}

const allowedProtocol = (value: string) => {
    try {
      const parsed = new URL(value)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
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
  GET = async (request: NextRequest) => {
    const url = request.nextUrl.searchParams.get('url')
    if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })
    if (!allowedProtocol(url)) return NextResponse.json({ error: 'url must be http or https' }, { status: 400 })
    return fetchRemote(url)
  },
  POST = async (request: NextRequest) => {
    const body = (await request.json()) as ImagePostBody,
      url = typeof body.url === 'string' ? body.url : ''
    if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })
    if (!allowedProtocol(url)) return NextResponse.json({ error: 'url must be http or https' }, { status: 400 })
    return fetchRemote(url)
  }

export { GET, POST }
