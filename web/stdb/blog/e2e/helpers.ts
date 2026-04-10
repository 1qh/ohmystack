/** biome-ignore-all lint/style/noProcessEnv: test helper */
// biome-ignore-all lint/nursery/useGlobalThis: test helper
import type { Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const TOKEN_FILE = join(import.meta.dirname, '.stdb-test-token.json')
const DEFAULT_HTTP_URL =
  process.env.SPACETIMEDB_URI?.replace('ws://', 'http://').replace('wss://', 'https://') ?? 'http://localhost:4000'
const DEFAULT_MODULE = process.env.SPACETIMEDB_MODULE_NAME ?? 'noboil'
const readTokenData = (): null | { identity: string; token: string } => {
  try {
    return JSON.parse(readFileSync(TOKEN_FILE, 'utf8')) as {
      identity: string
      token: string
    }
  } catch {
    return null
  }
}
const ensureToken = async (): Promise<{ identity: string; token: string }> => {
  const existing = readTokenData()
  if (existing) return existing
  const response = await fetch(`${DEFAULT_HTTP_URL}/v1/identity`, {
    method: 'POST'
  })
  const data = (await response.json()) as { identity: string; token: string }
  writeFileSync(TOKEN_FILE, JSON.stringify(data))
  return data
}
const login = async (page?: Page): Promise<void> => {
  if (!page) return
  const data = await ensureToken()
  await page.context().clearCookies()
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
      globalThis.localStorage.clear()
      globalThis.localStorage.setItem('spacetimedb.token', t)
    },
    { t: data.token }
  )
  const currentUrl = page.url()
  if (currentUrl !== 'about:blank' && !currentUrl.startsWith('chrome'))
    await page.evaluate(
      ({ t }) => {
        globalThis.localStorage.clear()
        globalThis.localStorage.setItem('spacetimedb.token', t)
      },
      { t: data.token }
    )
}
const cleanupTestData = async () => {
  const data = await ensureToken()
  await fetch(`${DEFAULT_HTTP_URL}/v1/database/${DEFAULT_MODULE}/call/cleanup_test_data`, {
    body: JSON.stringify([]),
    headers: {
      Authorization: `Bearer ${data.token}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })
}
export { cleanupTestData, login }
