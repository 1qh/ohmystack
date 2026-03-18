// biome-ignore-all lint/performance/useTopLevelRegex: x
import { expect, test } from './fixtures'
import { login } from './helpers'

const BLOG_DETAIL_URL = /\/[a-z0-9]+$/u,
  BLOG_EDIT_URL = /\/[a-z0-9]+\/edit$/u

test.describe
  .serial('Blog CRUD - Create', () => {
    test.beforeEach(async ({ blogPage }) => {
      await login()
      await blogPage.goto('/')
    })

    test('shows create button', async ({ blogPage }) => {
      await expect(blogPage.getCreateTrigger()).toBeVisible()
    })

    test('opens create dialog when clicking plus button', async ({ blogPage }) => {
      await blogPage.getCreateTrigger().click()
      await expect(blogPage.getCreateDialog()).toBeVisible()
    })

    test('can create a new blog post', async ({ blogPage }) => {
      const title = `Test Blog ${Date.now()}`
      await blogPage.createBlog(title, 'This is test content for the blog post.')

      await expect(blogPage.getBlogCards().first()).toContainText(title)
    })

    test('created blog appears in the list', async ({ blogPage }) => {
      const title = `Listed Blog ${Date.now()}`
      await blogPage.createBlog(title, 'Content for listing test')

      await expect(blogPage.getBlogList()).toBeVisible()
      await expect(blogPage.getBlogCards().filter({ hasText: title })).toHaveCount(1, { timeout: 10_000 })
    })

    test('form validates required fields', async ({ blogPage, page }) => {
      await blogPage.getCreateTrigger().click()
      await blogPage.getCreateSubmit().click()

      await expect(blogPage.getCreateDialog()).toBeVisible()
      await expect(page.locator('[data-invalid="true"]').first()).toBeVisible()
    })
  })

test.describe
  .serial('Blog CRUD - Read', () => {
    test.beforeEach(async ({ blogPage }) => {
      await login()
      await blogPage.goto('/')
    })

    test('shows list or empty state', async ({ blogPage }) => {
      await expect(blogPage.getBlogList().or(blogPage.getEmptyState()).first()).toBeVisible()
    })

    test('can navigate to blog detail page', async ({ blogPage, page }) => {
      const title = `Detail Blog ${Date.now()}`
      await blogPage.createBlog(title, 'Content for detail test')

      await blogPage.getBlogCards().first().locator('[data-testid="blog-card-link"]').click()
      await expect(page).toHaveURL(BLOG_DETAIL_URL)
      await expect(page.getByTestId('blog-detail-page')).toBeVisible()
      await expect(page.getByTestId('blog-detail-title')).toContainText(title)
    })
  })

test.describe
  .serial('Blog CRUD - Update', () => {
    test.beforeEach(async ({ blogPage }) => {
      await login()
      await blogPage.goto('/')
    })

    test('can navigate to edit page', async ({ blogPage, page }) => {
      const title = `Edit Blog ${Date.now()}`
      await blogPage.createBlog(title, 'Content to edit')

      await page.locator('[href*="/edit"]').first().click()
      await expect(page).toHaveURL(BLOG_EDIT_URL)
      await expect(page.getByTestId('edit-blog-page').first()).toBeVisible()
    })

    test('edit form shows current values', async ({ blogPage, page }) => {
      const title = `Pre-filled Blog ${Date.now()}`,
        content = 'Pre-filled content'
      await blogPage.createBlog(title, content)

      await page.locator('[href*="/edit"]').first().click()
      await expect(page.getByTestId('edit-blog-page').first()).toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('edit-title').first().locator('input')).toHaveValue(title)
      await expect(page.getByTestId('edit-content').first().locator('textarea')).toHaveValue(content)
    })

    test('can update blog title via auto-save', async ({ blogPage, page }) => {
      const title = `Original Title ${Date.now()}`
      await blogPage.createBlog(title, 'Content')

      await page.locator('[href*="/edit"]').first().click()
      await expect(page.getByTestId('edit-blog-page').first()).toBeVisible({ timeout: 10_000 })
      const newTitle = `Updated Title ${Date.now()}`
      await page.getByTestId('edit-title').first().locator('input').fill(newTitle)

      await expect(page.getByTestId('auto-save-indicator')).toBeVisible({ timeout: 5000 })
      await expect(page.getByTestId('auto-save-indicator')).toContainText('Saved', { timeout: 5000 })
    })

    test('auto-save indicator not visible before edits', async ({ blogPage, page }) => {
      const title = `NoSave Blog ${Date.now()}`
      await blogPage.createBlog(title, 'Content')

      await page.locator('[href*="/edit"]').first().click()
      await expect(page.getByTestId('edit-blog-page').first()).toBeVisible({ timeout: 10_000 })

      await expect(page.getByTestId('auto-save-indicator')).not.toBeVisible()
    })

    test('auto-save persists changes after reload', async ({ blogPage, page }) => {
      const title = `Persist Blog ${Date.now()}`
      await blogPage.createBlog(title, 'Original content')

      await page.locator('[href*="/edit"]').first().click()
      await expect(page.getByTestId('edit-blog-page').first()).toBeVisible({ timeout: 10_000 })

      const newContent = `Updated content ${Date.now()}`
      await page.getByTestId('edit-content').first().locator('textarea').fill(newContent)
      await expect(page.getByTestId('auto-save-indicator')).toContainText('Saved', { timeout: 5000 })

      await page.reload()
      await expect(page.getByTestId('edit-blog-page').first()).toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('edit-content').first().locator('textarea')).toHaveValue(newContent)
    })

    test('can toggle publish status', async ({ blogPage, page }) => {
      const title = `Toggle Blog ${Date.now()}`
      await blogPage.createBlog(title, 'Content')

      await page.locator('[href*="/edit"]').first().click()
      await page.getByTestId('settings-trigger').first().click()
      await expect(page.getByTestId('settings-popover')).toBeVisible()

      const publishSwitch = page.locator('[data-testid="settings-popover"]').locator('button[role="switch"]')
      await publishSwitch.click()
      await page.getByTestId('settings-popover').locator('button[type="submit"]').click()

      await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 })
    })
  })

test.describe
  .serial('Blog CRUD - Delete', () => {
    test.beforeEach(async ({ blogPage }) => {
      await login()
      await blogPage.goto('/')
    })

    test('shows delete confirmation dialog', async ({ blogPage }) => {
      await blogPage.createBlog(`Delete Test ${Date.now()}`, 'To be deleted')

      await blogPage.getDeleteTrigger().click()
      await expect(blogPage.getDeleteDialog()).toBeVisible()
      await expect(blogPage.getDeleteDialog()).toContainText('Delete blog?')
    })

    test('can cancel delete', async ({ blogPage }) => {
      const title = `Cancel Delete ${Date.now()}`
      await blogPage.createBlog(title, 'Not deleted')

      await blogPage.getDeleteTrigger().click()
      await blogPage.getDeleteCancel().click()

      await expect(blogPage.getDeleteDialog()).not.toBeVisible()
      await expect(blogPage.getBlogCards().first()).toContainText(title)
    })

    test('can confirm delete', async ({ blogPage }) => {
      const title = `Confirm Delete ${Date.now()}`
      await blogPage.createBlog(title, 'Deleted')
      await expect(blogPage.getBlogCards().filter({ hasText: title })).toHaveCount(1)

      await blogPage.deleteBlog()
      await expect(blogPage.getBlogCards().filter({ hasText: title })).toHaveCount(0, { timeout: 10_000 })
    })

    test('optimistic delete removes card immediately', async ({ blogPage }) => {
      const title = `Optimistic Delete ${Date.now()}`
      await blogPage.createBlog(title, 'Quick delete')
      await expect(blogPage.getBlogCards().filter({ hasText: title })).toHaveCount(1)

      await blogPage.getDeleteTrigger().click()
      await blogPage.getDeleteConfirm().click()

      await expect(blogPage.getBlogCards().filter({ hasText: title })).toHaveCount(0, { timeout: 2000 })
    })
  })

test.describe
  .serial('Blog CRUD - Navigation', () => {
    test.beforeEach(async ({ blogPage }) => {
      await login()
      await blogPage.goto('/')
    })

    test('back link works from edit page to detail', async ({ blogPage, page }) => {
      const title = `Back Link ${Date.now()}`
      await blogPage.createBlog(title, 'Content')

      await page.locator('[href*="/edit"]').first().click()
      await expect(page.getByTestId('edit-blog-page').first()).toBeVisible({ timeout: 10_000 })
      await page.getByTestId('back-link').first().click()

      await expect(page).toHaveURL(BLOG_DETAIL_URL)
      await expect(page.getByTestId('blog-detail-page')).toBeVisible()
    })
  })
