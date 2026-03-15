import { expect, test } from './fixtures'

test.describe
  .serial('Settings (MCP)', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/settings')
      const names = ['test-server', 'evil-server']
      for (const name of names) {
        const row = page.locator('li', { hasText: name })
        while ((await row.count()) > 0) {
          await row.first().getByRole('button', { name: /delete/iu }).click()
          await expect(page.getByText(name, { exact: true })).not.toBeVisible()
        }
      }
    })

    test('add server with valid URL', async ({ page }) => {
      await page.goto('/settings')
      await page.getByPlaceholder(/name/iu).fill('test-server')
      await page.getByPlaceholder(/url/iu).fill('https://example.com/mcp')
      await page.getByRole('button', { name: /add/iu }).click()
      await expect(page.getByText('test-server')).toBeVisible()
    })

    test('duplicate name rejected', async ({ page }) => {
      await page.goto('/settings')
      await page.getByPlaceholder(/name/iu).fill('test-server')
      await page.getByPlaceholder(/url/iu).fill('https://example.com/mcp')
      await page.getByRole('button', { name: /add/iu }).click()
      await expect(page.getByText('test-server')).toBeVisible()

      await page.getByPlaceholder(/name/iu).fill('test-server')
      await page.getByPlaceholder(/url/iu).fill('https://other.com/mcp')
      await page.getByRole('button', { name: /add/iu }).click()
      await expect(page.getByText(/name.*taken|duplicate/iu)).toBeVisible()
    })

    test('SSRF URL rejected', async ({ page }) => {
      await page.goto('/settings')
      await page.getByPlaceholder(/name/iu).fill('evil-server')
      await page.getByPlaceholder(/url/iu).fill('http://localhost:8080/mcp')
      await page.getByRole('button', { name: /add/iu }).click()
      await expect(page.getByText(/blocked/iu)).toBeVisible()
    })

    test('delete server removes from list', async ({ page }) => {
      await page.goto('/settings')
      await page.getByPlaceholder(/name/iu).fill('test-server')
      await page.getByPlaceholder(/url/iu).fill('https://example.com/mcp')
      await page.getByRole('button', { name: /add/iu }).click()
      await expect(page.getByText('test-server')).toBeVisible()

      const serverRow = page.locator('li', { hasText: 'test-server' })
      await serverRow.getByRole('button', { name: /delete/iu }).click()
      await expect(page.getByText('test-server')).not.toBeVisible()
    })
  })
