/** biome-ignore-all lint/style/noProcessEnv: test helper */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential test operations */
/** biome-ignore-all lint/nursery/noContinue: test helper */
// biome-ignore-all lint/nursery/useGlobalThis: test helper
/* eslint-disable no-await-in-loop, no-continue */
import type { Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const TOKEN_FILE = join(import.meta.dirname, '.stdb-test-token.json'),
  DEFAULT_HTTP_URL =
    process.env.SPACETIMEDB_URI?.replace('ws://', 'http://').replace('wss://', 'https://') ?? 'http://localhost:3000',
  DEFAULT_MODULE = process.env.SPACETIMEDB_MODULE_NAME ?? 'noboil',
  readTokenData = (): null | { identity: string; token: string } => {
    try {
      return JSON.parse(readFileSync(TOKEN_FILE, 'utf8')) as {
        identity: string
        token: string
      }
    } catch {
      return null
    }
  },
  ensureToken = async (): Promise<{ identity: string; token: string }> => {
    const existing = readTokenData()
    if (existing) return existing
    const response = await fetch(`${DEFAULT_HTTP_URL}/v1/identity`, {
        method: 'POST'
      }),
      data = (await response.json()) as { identity: string; token: string }
    writeFileSync(TOKEN_FILE, JSON.stringify(data))
    return data
  },
  login = async (page?: Page): Promise<void> => {
    if (!page) return
    const data = await ensureToken()
    await page.context().addCookies([
      {
        domain: 'localhost',
        name: 'spacetimedb_token',
        path: '/',
        value: encodeURIComponent(data.token)
      }
    ])
    await page.addInitScript(
      ({ t }) => {
        const g = globalThis as Record<string, unknown>
        g.PLAYWRIGHT = '1'
        globalThis.localStorage.setItem('spacetimedb.token', t)
      },
      { t: data.token }
    )
    const currentUrl = page.url()
    if (currentUrl !== 'about:blank' && !currentUrl.startsWith('chrome'))
      await page.evaluate(
        ({ t }) => {
          globalThis.localStorage.setItem('spacetimedb.token', t)
        },
        { t: data.token }
      )
  },
  cleanupTestData = async () => {
    const data = await ensureToken(),
      tables = ['blog', 'blog_profile']
    for (const table of tables) {
      const response = await fetch(`${DEFAULT_HTTP_URL}/v1/database/${DEFAULT_MODULE}/sql`, {
        body: `SELECT * FROM ${table}`,
        headers: {
          Authorization: `Bearer ${data.token}`,
          'Content-Type': 'text/plain'
        },
        method: 'POST'
      })
      if (!response.ok) continue
      const results = (await response.json()) as {
        rows?: unknown[]
        schema?: { elements?: { name?: { some?: string } }[] }
      }[]
      if (!Array.isArray(results) || results.length === 0) continue
      const rows = results[0]?.rows ?? [],
        elements = results[0]?.schema?.elements ?? [],
        idIdx = elements.findIndex(e => e.name?.some === 'id')
      if (idIdx === -1) continue
      for (const row of rows) {
        if (!Array.isArray(row)) continue
        const typedRow = row as unknown[],
          id = typedRow[idIdx]
        if (typeof id !== 'number') continue
        try {
          const reducerName = table === 'blog_profile' ? 'upsert_blogProfile' : `rm_${table}`
          if (table === 'blog_profile') continue
          await fetch(`${DEFAULT_HTTP_URL}/v1/database/${DEFAULT_MODULE}/call/${reducerName}`, {
            body: JSON.stringify([id]),
            headers: {
              Authorization: `Bearer ${data.token}`,
              'Content-Type': 'application/json'
            },
            method: 'POST'
          })
        } catch {
          /* Ignore */
        }
      }
    }
  }
export { cleanupTestData, login }
