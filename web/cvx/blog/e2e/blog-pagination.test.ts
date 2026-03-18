import { expect, test } from './fixtures'
import { login } from './helpers'

test.describe
  .serial('Blog Pagination', () => {
    test.beforeEach(async ({ blogPage }) => {
      await login()
      await blogPage.goto('/pagination')
    })

    test('shows pagination page with create button', async ({ blogPage }) => {
      await expect(blogPage.getCreateTrigger()).toBeVisible()
    })

    test('newly created blogs appear in list', async ({ blogPage }) => {
      const title = `Pagination New ${Date.now()}`
      await blogPage.createBlog(title, 'Fresh content')
      await expect(blogPage.getBlogCards().first()).toContainText(title, { timeout: 10_000 })
    })

    test('pagination UI is visible after data loads', async ({ blogPage, page }) => {
      await page
        .locator('[data-testid="pagination-exhausted"], [data-testid="load-more-trigger"], [data-testid="loading-more"]')
        .first()
        .waitFor({ timeout: 10_000 })

      const exhausted = blogPage.getPaginationExhausted(),
        loadMore = blogPage.getLoadMoreTrigger(),
        loadingMore = blogPage.getLoadingMore(),
        exhaustedVisible = await exhausted.isVisible().catch(() => false),
        loadMoreVisible = await loadMore.isVisible().catch(() => false),
        loadingVisible = await loadingMore.isVisible().catch(() => false)

      expect(exhaustedVisible || loadMoreVisible || loadingVisible).toBe(true)
    })
  })
