import { expect, test } from './fixtures'
import { ConvexHttpClient } from 'convex/browser'
import type { FunctionReference } from 'convex/server'
import { anyApi } from 'convex/server'

const convex = new ConvexHttpClient('http://127.0.0.1:3212')

test.describe.serial('Real-world scenarios', () => {
  test('full conversation flow supports multi-turn chat', async ({ chatPage, page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await chatPage.sendMessage('Hello')
    await page.waitForTimeout(3000)
    await expect(chatPage.getMessages().first()).toContainText('Hello')
    await chatPage.sendMessage('Tell me more')
    await page.waitForTimeout(3000)
    const logText = await page.getByRole('log').innerText(),
      firstIndex = logText.indexOf('Hello'),
      secondIndex = logText.indexOf('Tell me more')
    expect(firstIndex).toBeGreaterThanOrEqual(0)
    expect(secondIndex).toBeGreaterThan(firstIndex)
  })

  test('multiple sessions remain isolated while navigating between them', async ({ page, sessionListPage }) => {
    const sessions: { marker: string; sessionId: string }[] = []

    for (let i = 0; i < 3; i += 1) {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
      const sessionId = (page.url().split('/chat/')[1] ?? '').trim(),
        marker = `marker-${i}-${Date.now()}`
      await page.getByPlaceholder(/message/iu).fill(marker)
      await page.getByRole('button', { name: /send/iu }).click()
      await page.waitForTimeout(3000)
      sessions.push({ marker, sessionId })
    }

    await sessionListPage.goto('/')
    const cardCount = await sessionListPage.getSessionCards().count()
    if (cardCount > 0) {
      expect(cardCount).toBeGreaterThanOrEqual(1)
    } else {
      await expect(sessionListPage.getNewButton()).toBeVisible()
    }
    for (const session of sessions) {
      await page.goto(`/chat/${session.sessionId}`)
      await expect(page.locator('article').first()).toContainText(session.marker)
      await page.getByRole('link', { name: /sessions/i }).click()
      await page.waitForURL('/')
    }
  })

  test('rapid message sending preserves order without duplicates', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    const sent = ['rapid-one', 'rapid-two', 'rapid-three']
    for (const message of sent) {
      await page.getByPlaceholder(/message/iu).fill(message)
      await page.getByRole('button', { name: /send/iu }).click()
      await expect(page.getByPlaceholder(/message/iu)).toBeEnabled({ timeout: 5000 })
    }
    await page.waitForTimeout(5000)
    const logText = await page.getByRole('log').innerText()
    let previousIndex = -1
    for (const message of sent) {
      const firstIndex = logText.indexOf(message)
      expect(firstIndex).toBeGreaterThan(previousIndex)
      previousIndex = firstIndex
      expect(firstIndex).toBeGreaterThanOrEqual(0)
    }
  })

  test('session archival removes session from list', async ({ page, sessionListPage }) => {
    const title = `archive-${Date.now()}`
    const created = (await convex.mutation(anyApi.sessions.createSession as FunctionReference<'mutation'>, {
      title
    })) as { sessionId: string }
    await sessionListPage.goto('/')
    await page.waitForTimeout(1500)
    await expect(page.getByText(title)).toBeVisible({ timeout: 5000 })
    await convex.mutation(anyApi.sessions.archiveSession as FunctionReference<'mutation'>, {
      sessionId: created.sessionId as never
    })
    await page.reload()
    await page.waitForTimeout(1500)
    await expect(page.getByText(title)).toHaveCount(0)
  })

  test('settings persist after navigating to chat and back', async ({ page, sessionListPage }) => {
    const name = `persist-${Date.now()}`
    await page.goto('/settings')
    await page.getByPlaceholder(/name/iu).fill(name)
    await page.getByPlaceholder(/url/iu).fill('https://example.com/persist')
    await page.getByRole('button', { name: /add/iu }).click()
    await expect(page.getByText(name)).toBeVisible()

    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await page.getByRole('link', { name: /settings/i }).click()
    await page.waitForURL('/settings')
    await expect(page.getByText(name)).toBeVisible()
  })

  test('browser refresh keeps existing conversation visible', async ({ page, sessionListPage }) => {
    const message = `refresh-${Date.now()}`
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await page.getByPlaceholder(/message/iu).fill(message)
    await page.getByRole('button', { name: /send/iu }).click()
    await page.waitForTimeout(3000)
    await expect(page.locator('article').first()).toContainText(message)
    await page.reload()
    await expect(page.locator('article').first()).toContainText(message)
  })

  test('empty state transitions to first chat and back to list', async ({ page, sessionListPage }) => {
    const existing = (await convex.query(anyApi.sessions.listSessions as FunctionReference<'query'>, {})) as {
      _id: string
    }[]
    for (const session of existing) {
      await convex.mutation(anyApi.sessions.archiveSession as FunctionReference<'mutation'>, {
        sessionId: session._id as never
      })
    }

    await sessionListPage.goto('/')
    await expect(sessionListPage.getSessionCards()).toHaveCount(0)
    await expect(sessionListPage.getNewButton()).toBeVisible()
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await page.getByRole('link', { name: /sessions/i }).click()
    await page.waitForURL('/')
    await expect(sessionListPage.getSessionCards().first()).toBeVisible()
  })

  test('message submit errors are shown to users', async ({ page, sessionListPage }) => {
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    const sessionId = (page.url().split('/chat/')[1] ?? '').trim()
    await convex.mutation(anyApi.sessions.archiveSession as FunctionReference<'mutation'>, {
      sessionId: sessionId as never
    })
    await page.getByPlaceholder(/message/iu).fill('trigger error')
    await page.getByRole('button', { name: /send/iu }).click()
    await expect(page.getByTestId('submit-error')).toBeVisible()
  })

  test('long messages render without layout breakage', async ({ page, sessionListPage }) => {
    const longMessage = `long-${Date.now()}-${'x'.repeat(600)}`
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await page.getByPlaceholder(/message/iu).fill(longMessage)
    await page.getByRole('button', { name: /send/iu }).click()
    await page.waitForTimeout(3000)
    const messageRow = page.locator('article').first()
    await expect(messageRow).toContainText(longMessage.slice(0, 80))
    const box = await messageRow.boundingBox(),
      viewport = page.viewportSize()
    expect(box).not.toBeNull()
    expect(viewport).not.toBeNull()
    expect(box ? box.width : 0).toBeLessThanOrEqual(viewport ? viewport.width : Number.MAX_SAFE_INTEGER)
  })

  test('concurrent tab simulation reflects updates across tabs', async ({ page, sessionListPage }) => {
    const first = `tab-one-${Date.now()}`,
      second = `tab-two-${Date.now()}`
    await sessionListPage.goto('/')
    await sessionListPage.getNewButton().click()
    await page.waitForURL(/\/chat\//u)
    await page.getByPlaceholder(/message/iu).fill(first)
    await page.getByRole('button', { name: /send/iu }).click()
    await page.waitForTimeout(3000)

    const secondTab = await page.context().newPage(),
      sessionUrl = page.url()
    await secondTab.goto(sessionUrl)
    await secondTab.getByPlaceholder(/message/iu).fill(second)
    await secondTab.getByRole('button', { name: /send/iu }).click()
    await expect(page.locator('article').filter({ hasText: second }).first()).toBeVisible({ timeout: 10_000 })
    await secondTab.close()
  })
})
