/* eslint-disable no-empty */
import { serve } from 'bun'
const BACKEND_API = 'http://127.0.0.1:3212',
  BACKEND_WS = 'ws://127.0.0.1:3212',
  SITE_URL = 'http://127.0.0.1:3211'

// oxlint-disable-next-line no-empty-function
process.on('uncaughtException', () => {})
// oxlint-disable-next-line no-empty-function
process.on('unhandledRejection', () => {})

serve({
  fetch: async (req, server) => {
    try {
      const url = new URL(req.url)

      if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
        if (server.upgrade(req, { data: { url: `${BACKEND_WS}${url.pathname}${url.search}` } })) return

        return new Response('WebSocket upgrade failed', { status: 500 })
      }

      const target = url.pathname.startsWith('/api/auth') ? SITE_URL : BACKEND_API,
        targetUrl = `${target}${url.pathname}${url.search}`,
        headers = new Headers(req.headers)
      headers.delete('host')

      const response = await fetch(targetUrl, {
        body: req.body,
        headers,
        method: req.method,
        redirect: 'manual'
      })

      return new Response(response.body, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText
      })
    } catch {
      return new Response('Proxy error', { status: 502 })
    }
  },

  port: 3210,

  websocket: {
    close: ws => {
      try {
        const d = ws.data as Record<string, unknown>
        if (d.upstream) (d.upstream as WebSocket).close()
      } catch {}
    },
    message: (ws, message) => {
      try {
        const d = ws.data as Record<string, unknown>
        if (d.ready && d.upstream) {
          ;(d.upstream as WebSocket).send(message)
        } else {
          d.queue ??= []
          ;(d.queue as (ArrayBuffer | Buffer | string)[]).push(message)
        }
      } catch {}
    },
    open: ws => {
      try {
        const { url } = ws.data as { url: string },
          upstream = new WebSocket(url)
        ;(ws.data as Record<string, unknown>).upstream = upstream
        upstream.addEventListener('open', () => {
          ;(ws.data as Record<string, unknown>).ready = true
          const q = (ws.data as Record<string, unknown>).queue as (Buffer | string)[] | undefined
          if (q) {
            for (const m of q) upstream.send(m)
            ;(ws.data as Record<string, unknown>).queue = undefined
          }
        })
        upstream.addEventListener('message', event => {
          try {
            ws.send(event.data as string)
          } catch {}
        })
        upstream.addEventListener('close', () => {
          try {
            ws.close()
          } catch {}
        })
        upstream.addEventListener('error', () => {
          try {
            ws.close()
          } catch {}
        })
      } catch {}
    }
  }
})
