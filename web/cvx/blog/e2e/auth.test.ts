// biome-ignore-all lint/performance/useTopLevelRegex: x
import { expect, test } from './fixtures'
import { login } from './helpers'

test.describe('Authentication', () => {
  test('session persists across page navigation', async ({ page }) => {
    await login()
    await page.goto('/')
    await expect(page).toHaveURL('/')

    await page.goto('/pagination')
    await page.goto('/')
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('blog-search-input')).toBeVisible()
  })

  test('session persists after page reload', async ({ page }) => {
    await login()
    await page.goto('/')

    await page.reload()
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('blog-search-input')).toBeVisible()
  })
})

test.describe('Authentication Failures', () => {
  test('login page shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login/email')

    await page.fill('[name="email"]', 'invalid@example.com')
    await page.fill('[name="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    await expect(page.getByText(/could not sign in|invalid password/iu)).toBeVisible({ timeout: 5000 })
  })

  test('login form validates required fields', async ({ page }) => {
    await page.goto('/login/email')

    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()

    const emailInput = page.locator('[name="email"]')
    await expect(emailInput).toBeVisible()
    await expect(page).toHaveURL('/login/email')
  })

  test('login form shows different error for sign up vs sign in', async ({ page }) => {
    await page.goto('/login/email')
    await page.locator('[name="email"]').waitFor({ state: 'visible' })

    await page.fill('[name="email"]', 'nonexistent@example.com')
    await page.fill('[name="password"]', 'testpassword123')
    await page.click('button[type="submit"]')

    await expect(page.getByText(/could not sign in.*sign up/iu)).toBeVisible({ timeout: 5000 })
  })

  test('can toggle between sign in and sign up modes', async ({ page }) => {
    await page.goto('/login/email')

    const toggleButton = page.locator('button[type="button"]', { hasText: /sign up/iu })
    await expect(toggleButton).toBeVisible()

    await toggleButton.click()
    await expect(page.locator('button[type="submit"]', { hasText: /sign up/iu })).toBeVisible()

    const backButton = page.locator('button[type="button"]', { hasText: /log in/iu })
    await backButton.click()
    await expect(page.locator('button[type="submit"]', { hasText: /sign in/iu })).toBeVisible()
  })

  test('invalid password error shows specific message', async ({ page }) => {
    await page.goto('/login/email')

    await page.fill('[name="email"]', 'test@example.com')
    await page.fill('[name="password"]', 'short')

    const toggleButton = page.locator('button[type="button"]', { hasText: /sign up/iu })
    await toggleButton.click()

    await page.click('button[type="submit"]')

    await expect(page.getByText(/could not sign up/iu)).toBeVisible({ timeout: 5000 })
  })

  test('login page is accessible without authentication', async ({ page }) => {
    await page.goto('/login/email')

    await expect(page.locator('[name="email"]')).toBeVisible()
    await expect(page.locator('[name="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('login form clears on mode toggle', async ({ page }) => {
    await page.goto('/login/email')

    await page.fill('[name="email"]', 'test@example.com')
    await page.fill('[name="password"]', 'testpassword')

    const toggleButton = page.getByRole('button', { name: /account/iu })
    await toggleButton.click()

    const emailValue = await page.locator('[name="email"]').inputValue(),
      passwordValue = await page.locator('[name="password"]').inputValue()

    expect(emailValue).toBe('test@example.com')
    expect(passwordValue).toBe('testpassword')
  })
})
