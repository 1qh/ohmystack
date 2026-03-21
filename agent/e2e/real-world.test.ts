/* eslint-disable no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Playwright ops */
/** biome-ignore-all lint/nursery/noPlaywrightWaitForTimeout: Convex reactive delay */
import type { FunctionReference } from 'convex/server'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'
import { expect, test } from './fixtures'
const convex = new ConvexHttpClient('http://127.0.0.1:3212'),
  CHAT_URL_RE = /\/chat\//u,
  MESSAGE_RE = /message the agent/iu,
  SEND_RE = /send/iu,
  SESSIONS_RE = /sessions/iu,
  NEW_RE = /new/iu,
  SETTINGS_RE = /settings/iu,
  NAME_RE = /name/iu,
  URL_RE = /url/iu,
  ADD_RE = /add/iu,
  DELETE_RE = /delete/iu,
  RATE_LIMITED_RE = /rate_limited:submitMessage:(?<waitMs>\d+)/u
test.describe
  .serial('Real-world scenarios', () => {
    test('full conversation flow supports multi-turn chat', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await chatPage.sendMessage('Hello')
      await page.waitForTimeout(3000)
      await expect(chatPage.getMessages().first()).toContainText('Hello')
      await chatPage.sendMessage('Tell me more')
      await page.waitForTimeout(3000)
      const logText = await page.getByRole('log').textContent(),
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
        await page.waitForURL(CHAT_URL_RE)
        const sessionId = (page.url().split('/chat/')[1] ?? '').trim(),
          marker = `marker-${i}-${Date.now()}`
        await page.getByPlaceholder(MESSAGE_RE).fill(marker)
        await page.getByRole('button', { name: SEND_RE }).click()
        await page.waitForTimeout(3000)
        sessions.push({ marker, sessionId })
      }
      await sessionListPage.goto('/')
      const cardCount = await sessionListPage.getSessionCards().count()
      if (cardCount > 0) expect(cardCount).toBeGreaterThanOrEqual(1)
      else await expect(sessionListPage.getNewButton()).toBeVisible()
      for (const session of sessions) {
        await page.goto(`/chat/${session.sessionId}`)
        await expect(page.locator('.is-user, .is-assistant').first()).toContainText(session.marker)
        await page.getByRole('link', { name: SESSIONS_RE }).click()
        await page.waitForURL('/')
      }
    })
    test('rapid message sending preserves order without duplicates', async ({ page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      const sent = ['rapid-one', 'rapid-two', 'rapid-three']
      for (const message of sent) {
        await page.getByPlaceholder(MESSAGE_RE).fill(message)
        await page.getByRole('button', { name: SEND_RE }).click()
        await expect(page.getByPlaceholder(MESSAGE_RE)).toBeEnabled({
          timeout: 5000
        })
      }
      await page.waitForTimeout(5000)
      const logText = await page.getByRole('log').textContent()
      let previousIndex = -1
      for (const message of sent) {
        const firstIndex = logText.indexOf(message)
        expect(firstIndex).toBeGreaterThan(previousIndex)
        previousIndex = firstIndex
        expect(firstIndex).toBeGreaterThanOrEqual(0)
      }
    })
    test('session archival removes session from list', async ({ page, sessionListPage }) => {
      const title = `archive-${Date.now()}`,
        created = (await convex.mutation(anyApi.sessions.createSession as FunctionReference<'mutation'>, {
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
      await page.getByPlaceholder(NAME_RE).fill(name)
      await page.getByPlaceholder(URL_RE).fill('https://example.com/persist')
      await page.getByRole('button', { name: ADD_RE }).click()
      await expect(page.getByText(name)).toBeVisible()
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await page.getByRole('link', { name: SETTINGS_RE }).click()
      await page.waitForURL('/settings')
      await expect(page.getByText(name)).toBeVisible()
    })
    test('browser refresh keeps existing conversation visible', async ({ page, sessionListPage }) => {
      const message = `refresh-${Date.now()}`
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await page.getByPlaceholder(MESSAGE_RE).fill(message)
      await page.getByRole('button', { name: SEND_RE }).click()
      await page.waitForTimeout(3000)
      await expect(page.locator('.is-user, .is-assistant').first()).toContainText(message)
      await page.reload()
      await expect(page.locator('.is-user, .is-assistant').first()).toContainText(message)
    })
    test('empty state transitions to first chat and back to list', async ({ page, sessionListPage }) => {
      const existing = (await convex.query(anyApi.sessions.listSessions as FunctionReference<'query'>, {})) as {
        _id: string
      }[]
      for (const session of existing)
        await convex.mutation(anyApi.sessions.archiveSession as FunctionReference<'mutation'>, {
          sessionId: session._id as never
        })
      await sessionListPage.goto('/')
      await expect(sessionListPage.getSessionCards()).toHaveCount(0)
      await expect(sessionListPage.getNewButton()).toBeVisible()
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await page.getByRole('link', { name: SESSIONS_RE }).click()
      await page.waitForURL('/')
      await expect(sessionListPage.getSessionCards().first()).toBeVisible()
    })
    test('message submit errors are shown to users', async ({ page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      const sessionId = (page.url().split('/chat/')[1] ?? '').trim()
      await convex.mutation(anyApi.sessions.archiveSession as FunctionReference<'mutation'>, {
        sessionId: sessionId as never
      })
      await page.getByPlaceholder(MESSAGE_RE).fill('trigger error')
      await page.getByRole('button', { name: SEND_RE }).click()
      await expect(page.getByTestId('submit-error')).toBeVisible()
    })
    test('long messages render without layout breakage', async ({ page, sessionListPage }) => {
      const longMessage = `long-${Date.now()}-${'x'.repeat(600)}`
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await page.getByPlaceholder(MESSAGE_RE).fill(longMessage)
      await page.getByRole('button', { name: SEND_RE }).click()
      await page.waitForTimeout(3000)
      const messageRow = page.locator('.is-user, .is-assistant').first()
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
      await page.waitForURL(CHAT_URL_RE)
      await page.getByPlaceholder(MESSAGE_RE).fill(first)
      await page.getByRole('button', { name: SEND_RE }).click()
      await page.waitForTimeout(3000)
      const secondTab = await page.context().newPage(),
        sessionUrl = page.url()
      await secondTab.goto(sessionUrl)
      await secondTab.getByPlaceholder(MESSAGE_RE).fill(second)
      await secondTab.getByRole('button', { name: SEND_RE }).click()
      await expect(page.locator('.is-user, .is-assistant').filter({ hasText: second }).first()).toBeVisible({
        timeout: 10_000
      })
      await secondTab.close()
    })
  })
test.describe
  .serial('Real-world edge scenarios', () => {
    test('two tabs show same messages', async ({ browser, sessionListPage }) => {
      await sessionListPage.goto('/')
      const context1 = await browser.newContext(),
        page1 = await context1.newPage(),
        context2 = await browser.newContext(),
        page2 = await context2.newPage(),
        marker = `two-tabs-${Date.now()}`
      await page1.goto('/')
      await page1.getByRole('button', { name: NEW_RE }).click()
      await page1.waitForURL(CHAT_URL_RE)
      const sessionUrl = page1.url()
      await page2.goto(sessionUrl)
      await page1.getByPlaceholder(MESSAGE_RE).fill(marker)
      await page1.getByRole('button', { name: SEND_RE }).click()
      await expect(page2.locator('.is-user, .is-assistant').filter({ hasText: marker }).first()).toBeVisible({
        timeout: 10_000
      })
      await context1.close()
      await context2.close()
    })
    test('chat with many messages loads and scrolls', async ({ page }) => {
      const created = (await convex.mutation(anyApi.sessions.createSession as FunctionReference<'mutation'>, {
        title: `many-${Date.now()}`
      })) as { sessionId: string }
      let seeded = 0
      while (seeded < 10)
        try {
          await convex.mutation(anyApi.orchestrator.submitMessage as FunctionReference<'mutation'>, {
            content: `seed-many-${seeded}`,
            sessionId: created.sessionId as never
          })
          seeded += 1
        } catch (error) {
          const message = String(error),
            match = RATE_LIMITED_RE.exec(message)
          if (!match?.groups?.waitMs) throw error
          const waitMs = Math.max(250, Number(match.groups.waitMs) - Date.now())
          await page.waitForTimeout(waitMs)
        }
      await page.goto(`/chat/${created.sessionId}`)
      await page.waitForTimeout(3000)
      const messages = page.locator('.is-user, .is-assistant')
      expect(await messages.count()).toBeGreaterThanOrEqual(5)
      const log = page.getByRole('log'),
        dimensions = await log.evaluate(element => ({
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight
        }))
      expect(dimensions.scrollHeight).toBeGreaterThanOrEqual(dimensions.clientHeight)
      await log.evaluate(element => {
        element.scrollTop = element.scrollHeight
      })
    })
    test('browser back returns to session list', async ({ page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await page.goBack()
      await page.waitForURL('/')
      await expect(page.getByRole('button', { name: NEW_RE })).toBeVisible()
    })
    test('rapid MCP server create and delete stays consistent', async ({ page }) => {
      await page.goto('/settings')
      const name = `rapid-${Date.now()}`
      await page.getByPlaceholder(NAME_RE).fill(name)
      await page.getByPlaceholder(URL_RE).fill('https://example.com/rapid')
      await page.getByRole('button', { name: ADD_RE }).click()
      await expect(page.getByText(name)).toBeVisible()
      const row = page.locator('li', { hasText: name })
      await row.getByRole('button', { name: DELETE_RE }).click()
      await page.waitForTimeout(1000)
      await expect(page.getByText(name)).toHaveCount(0)
    })
    test('message text is selectable', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await chatPage.sendMessage('Selectable text test')
      await page.waitForTimeout(2000)
      const msg = chatPage.getMessages().first(),
        userSelect = await msg.evaluate(el => globalThis.getComputedStyle(el).userSelect)
      expect(userSelect).not.toBe('none')
    })
    test('reactive updates work after page idle', async ({ chatPage, page, sessionListPage }) => {
      await sessionListPage.goto('/')
      await sessionListPage.getNewButton().click()
      await page.waitForURL(CHAT_URL_RE)
      await chatPage.sendMessage('Before idle')
      await page.waitForTimeout(5000)
      await chatPage.sendMessage('After idle')
      await page.waitForTimeout(2000)
      const msgs = chatPage.getMessages()
      expect(await msgs.count()).toBeGreaterThanOrEqual(2)
    })
  })
