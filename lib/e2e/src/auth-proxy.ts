/** biome-ignore-all lint/style/noProcessEnv: env fallbacks */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: e2e proxy env vars */
import { serve } from 'bun'
const BACKEND_API = process.env.CONVEX_URL ?? 'http://127.0.0.1:4001'
const BACKEND_WS = process.env.CONVEX_WS_URL ?? 'ws://127.0.0.1:4001'
const SITE_URL = process.env.CONVEX_SITE_URL ?? 'http://127.0.0.1:4002'
const swallow = () => undefined
process.on('uncaughtException', swallow)
process.on('unhandledRejection', swallow)
serve({
  fetch: async (req, server) => {
    try {
      const url = new URL(req.url)
      if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
        if (
          server.upgrade(req, {
            data: { url: `${BACKEND_WS}${url.pathname}${url.search}` }
          })
        )
          return
        return new Response('WebSocket upgrade failed', { status: 500 })
      }
      const target = url.pathname.startsWith('/api/auth') ? SITE_URL : BACKEND_API
      const targetUrl = `${target}${url.pathname}${url.search}`
      const headers = new Headers(req.headers)
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
  port: 4001,
  websocket: {
    close: ws => {
      try {
        const d = ws.data as Record<string, unknown>
        if (d.upstream) (d.upstream as WebSocket).close()
      } catch {
        swallow()
      }
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
      } catch {
        swallow()
      }
    },
    open: ws => {
      try {
        const { url } = ws.data as { url: string }
        const upstream = new WebSocket(url)
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
          } catch {
            swallow()
          }
        })
        upstream.addEventListener('close', () => {
          try {
            ws.close()
          } catch {
            swallow()
          }
        })
        upstream.addEventListener('error', () => {
          try {
            ws.close()
          } catch {
            swallow()
          }
        })
      } catch {
        swallow()
      }
    }
  }
})
