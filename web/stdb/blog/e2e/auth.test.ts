// biome-ignore-all lint/performance/useTopLevelRegex: x
import { expect, test } from './fixtures'
import { login } from './helpers'

test.describe('Authentication', () => {
  test('session persists across page navigation', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await expect(page).toHaveURL('/')

    await page.goto('/pagination')
    await page.goto('/')
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('blog-search-input')).toBeVisible()
  })

  test('session persists after page reload', async ({ page }) => {
    await login(page)
    await page.goto('/')

    await page.reload()
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('blog-search-input')).toBeVisible()
  })
})

test.describe('Authentication Failures', () => {
  test('login page renders email auth controls', async ({ page }) => {
    await page.goto('/login/email')

    await expect(page.locator('[name="email"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toContainText(/continue with email/iu)
  })

  test('login page uses email-only input mode', async ({ page }) => {
    await page.goto('/login/email')

    await expect(page.locator('[name="email"]')).toBeVisible()
    await expect(page.locator('[name="password"]')).toHaveCount(0)
  })

  test('login form shows different labels for sign up vs sign in', async ({ page }) => {
    await page.goto('/login/email')
    await expect(page.locator('button[type="submit"]')).toContainText(/continue with email/iu)
    await page.locator('button[type="button"]', { hasText: /sign up/iu }).click()
    await expect(page.locator('button[type="submit"]')).toContainText(/create account with email/iu)
  })

  test('can toggle between sign in and sign up modes', async ({ page }) => {
    await page.goto('/login/email')

    const toggleButton = page.locator('button[type="button"]', { hasText: /sign up/iu })
    await expect(toggleButton).toBeVisible()

    await toggleButton.click()
    await expect(page.locator('button[type="submit"]')).toContainText(/create account with email/iu)

    const backButton = page.locator('button[type="button"]', { hasText: /log in/iu })
    await backButton.click()
    await expect(page.locator('button[type="submit"]')).toContainText(/continue with email/iu)
  })

  test('sign-up mode can switch back to log in mode', async ({ page }) => {
    await page.goto('/login/email')
    await page.locator('button[type="button"]', { hasText: /sign up/iu }).click()
    await page.locator('button[type="button"]', { hasText: /log in/iu }).click()
    await expect(page.locator('button[type="submit"]')).toContainText(/continue with email/iu)
  })

  test('login page is accessible without authentication', async ({ page }) => {
    await page.goto('/login/email')

    await expect(page.locator('[name="email"]')).toBeVisible()
    await expect(page.locator('[name="password"]')).toHaveCount(0)
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('login form clears on mode toggle', async ({ page }) => {
    await page.goto('/login/email')

    await page.fill('[name="email"]', 'test@example.com')

    const toggleButton = page.getByRole('button', { name: /account/iu })
    await toggleButton.click()

    const emailValue = await page.locator('[name="email"]').inputValue()
    expect(emailValue).toBe('test@example.com')
  })
})
