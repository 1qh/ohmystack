import { expect, test } from './fixtures'
import { login } from './helpers'

test.describe
  .serial('Blog Search', () => {
    test.beforeEach(async ({ blogPage, page }) => {
      await login()
      await page.waitForLoadState('domcontentloaded')
      await blogPage.goto('/')
      await page.locator('[data-testid="blog-list"], [data-testid="empty-state"]').first().waitFor()
    })

    test('shows search input on home page', async ({ blogPage }) => {
      await expect(blogPage.getSearchInput()).toBeVisible()
    })

    test('filters blogs by title', async ({ blogPage }) => {
      const uniqueWord = `unique${Date.now()}`
      await blogPage.createBlog(`Blog with ${uniqueWord}`, `Some content with ${uniqueWord}`)

      await blogPage.search(uniqueWord)
      await expect(blogPage.getBlogCards()).toHaveCount(1, { timeout: 10_000 })
      await expect(blogPage.getBlogCards().first()).toContainText(uniqueWord)
    })

    test('filters blogs by content', async ({ blogPage }) => {
      const uniqueContent = `content${Date.now()}`
      await blogPage.createBlog('First post', `This has ${uniqueContent} inside`)

      await blogPage.search(uniqueContent)
      await expect(blogPage.getBlogCards()).toHaveCount(1, { timeout: 10_000 })
    })

    test('filters blogs by content with tags present', async ({ blogPage }) => {
      const uniqueContent = `content${Date.now()}`,
        uniqueTitle = `Tagged post ${Date.now()}`
      await blogPage.createBlog(uniqueTitle, `Content with ${uniqueContent}`, { tags: ['tagged'] })

      await blogPage.search(uniqueContent)
      await expect(blogPage.getBlogCards()).toHaveCount(1, { timeout: 15_000 })
      await expect(blogPage.getBlogCards().first()).toContainText(uniqueTitle)
    })

    test('search shows matching results and clears', async ({ blogPage }) => {
      const uniquePrefix = `searchclear${Date.now()}`
      await blogPage.createBlog(`${uniquePrefix}First`, 'Content one')
      await blogPage.createBlog(`${uniquePrefix}Second`, 'Content two')

      await blogPage.search(`${uniquePrefix}First`)
      await expect(blogPage.getBlogCards()).toHaveCount(1, { timeout: 10_000 })

      await blogPage.clearSearch()
      await blogPage.search(uniquePrefix)
      await expect(blogPage.getBlogCards()).toHaveCount(2, { timeout: 10_000 })
    })

    test('shows empty state when no results match', async ({ blogPage }) => {
      await blogPage.search('nonexistentterm12345xyz')
      await expect(blogPage.getBlogCards()).toHaveCount(0, { timeout: 5000 })
    })

    test('search is case insensitive', async ({ blogPage }) => {
      const uniqueId = Date.now()
      await blogPage.createBlog(`UPPERCASE${uniqueId} Title`, `lowercase${uniqueId} content UPPERCASE${uniqueId}`)

      await blogPage.search(`uppercase${uniqueId}`)
      await expect(blogPage.getBlogCards()).toHaveCount(1, { timeout: 10_000 })

      await blogPage.clearSearch()
      await blogPage.search(`LOWERCASE${uniqueId}`)
      await expect(blogPage.getBlogCards()).toHaveCount(1, { timeout: 10_000 })
    })

    test('search updates in real-time', async ({ blogPage }) => {
      const uniqueId = Date.now()
      await blogPage.createBlog(`React${uniqueId} tutorial`, `Learn React basics ${uniqueId}`)
      await blogPage.createBlog(`Vue${uniqueId} tutorial`, `Learn Vue basics ${uniqueId}`)

      await blogPage.search(`React${uniqueId}`)
      await expect(blogPage.getBlogCards()).toHaveCount(1, { timeout: 10_000 })

      await blogPage.getSearchInput().fill(`${uniqueId}`)
      await expect(blogPage.getBlogCards()).toHaveCount(2, { timeout: 10_000 })
    })
  })
