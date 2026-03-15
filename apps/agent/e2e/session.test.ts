import { expect, test } from './fixtures'
import { ConvexHttpClient } from 'convex/browser'
import type { FunctionReference } from 'convex/server'
import { anyApi } from 'convex/server'

const convex = new ConvexHttpClient('http://127.0.0.1:3212')

test.describe
  .serial('Session Management', () => {
    test.beforeEach(async ({ sessionListPage }) => {
      await sessionListPage.goto('/')
    })

    test('session list loads', async ({ sessionListPage }) => {
      await expect(sessionListPage.getNewButton()).toBeVisible()
    })

    test('create session navigates to chat', async ({ page, sessionListPage }) => {
      await sessionListPage.getNewButton().click()
      await page.waitForURL(/\/chat\//u)
    })
  })

test.describe
  .serial('Session Management - remaining coverage', () => {
    test('multiple sessions appear in list', async ({ page, sessionListPage }) => {
      const firstTitle = `Session A ${Date.now()}`,
        secondTitle = `Session B ${Date.now()}`
      await convex.mutation(anyApi.sessions.createSession as FunctionReference<'mutation'>, { title: firstTitle })
      await convex.mutation(anyApi.sessions.createSession as FunctionReference<'mutation'>, { title: secondTitle })
      await sessionListPage.goto('/')
      await expect(page.getByRole('button', { name: new RegExp(firstTitle, 'u') })).toBeVisible()
      await expect(page.getByRole('button', { name: new RegExp(secondTitle, 'u') })).toBeVisible()
    })

    test('session timestamp is displayed', async ({ page, sessionListPage }) => {
      const title = `Timestamp ${Date.now()}`
      await convex.mutation(anyApi.sessions.createSession as FunctionReference<'mutation'>, { title })
      await sessionListPage.goto('/')
      const timestamp = page.getByRole('button', { name: new RegExp(title, 'u') }).locator('div').nth(1)
      await expect(timestamp).toBeVisible()
      await expect(timestamp).not.toHaveText('')
    })

    test('session card navigation opens specific chat', async ({ page, sessionListPage }) => {
      const firstTitle = `Nav A ${Date.now()}`,
        secondTitle = `Nav B ${Date.now()}`,
        firstSession = (await convex.mutation(anyApi.sessions.createSession as FunctionReference<'mutation'>, {
          title: firstTitle
        })) as { sessionId: string },
        secondSession = (await convex.mutation(anyApi.sessions.createSession as FunctionReference<'mutation'>, {
          title: secondTitle
        })) as { sessionId: string }
      await sessionListPage.goto('/')
      await page.getByRole('button', { name: new RegExp(firstTitle, 'u') }).click()
      await page.waitForURL(new RegExp(`/chat/${firstSession.sessionId}$`, 'u'))
      await page.getByRole('link', { name: /sessions/i }).click()
      await page.waitForURL('/')
      await page.getByRole('button', { name: new RegExp(secondTitle, 'u') }).click()
      await page.waitForURL(new RegExp(`/chat/${secondSession.sessionId}$`, 'u'))
    })
  })
