/* eslint-disable no-await-in-loop */
/* oxlint-disable eslint/no-await-in-loop */
// biome-ignore-all lint/style/useConsistentMemberAccessibility: x
// biome-ignore-all lint/performance/noAwaitInLoops: e2e sequential
import type { Locator } from '@playwright/test'
import BasePage from '@a/e2e/base-page'
class BlogPage extends BasePage {
  public async addTags(tags: string[]): Promise<void> {
    const tagsInput = this.getTagsInput()
    await tagsInput.scrollIntoViewIfNeeded()
    await tagsInput.waitFor({ state: 'visible', timeout: 5000 })
    for (const tag of tags) {
      await tagsInput.fill(tag)
      await tagsInput.press('Enter')
    }
  }
  public async clearSearch(): Promise<void> {
    await this.getSearchInput().clear()
  }
  public async createBlog(
    title: string,
    content: string,
    options?: { category?: string; tags?: string[] }
  ): Promise<void> {
    await this.getCreateTrigger().click()
    await this.getCreateDialog().waitFor({ state: 'visible' })
    await this.getTitleInput().fill(title)
    await this.getContentTextarea().fill(content)
    await this.getCategoryInput().fill(options?.category ?? 'general')
    if (options?.tags) await this.addTags(options.tags)
    await this.getCreateSubmit().click()
    await this.getCreateDialog().waitFor({ state: 'hidden' })
  }
  public async deleteBlog(): Promise<void> {
    await this.getDeleteTrigger().click()
    await this.getDeleteDialog().waitFor({ state: 'visible' })
    await this.getDeleteConfirm().click()
    await this.getDeleteDialog().waitFor({ state: 'hidden' })
  }
  public getAttachmentsInput(): Locator {
    return this.$('blog-attachments', 'input[type="file"]')
  }
  public getAutoSaveIndicator(): Locator {
    return this.$('auto-save-indicator')
  }
  public getBlogCards(): Locator {
    return this.$$('blog-card')
  }
  public getBlogList(): Locator {
    return this.$('blog-list')
  }
  public getCategoryInput(): Locator {
    return this.$('blog-category', 'input')
  }
  public getContentTextarea(): Locator {
    return this.$('blog-content', 'textarea')
  }
  public getCoverImageInput(): Locator {
    return this.$('blog-cover-image', 'input[type="file"]')
  }
  public getCreateDialog(): Locator {
    return this.$('create-blog-dialog')
  }
  public getCreateSubmit(): Locator {
    return this.$('create-blog-submit')
  }
  public getCreateTrigger(): Locator {
    return this.$('create-blog-trigger').first()
  }
  public getDeleteCancel(): Locator {
    return this.$('delete-cancel')
  }
  public getDeleteConfirm(): Locator {
    return this.$('delete-confirm')
  }
  public getDeleteDialog(): Locator {
    return this.$('delete-dialog')
  }
  public getDeleteTrigger(): Locator {
    return this.$('delete-blog-trigger').first()
  }
  public getEmptyState(): Locator {
    return this.$('empty-state')
  }
  public getLoadingMore(): Locator {
    return this.$('loading-more')
  }
  public getLoadMoreTrigger(): Locator {
    return this.$('load-more-trigger')
  }
  public getPaginationExhausted(): Locator {
    return this.$('pagination-exhausted')
  }
  public getSearchInput(): Locator {
    return this.$('blog-search-input').first()
  }
  public getTagsInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Tags' })
  }
  public getTitleInput(): Locator {
    return this.$('blog-title', 'input')
  }
  public async goto(path: '/' | '/pagination' = '/'): Promise<void> {
    await this.page.goto(path)
    await this.page.locator('[data-testid="blog-list"], [data-testid="empty-state"]').first().waitFor()
  }
  public async search(query: string): Promise<void> {
    await this.getSearchInput().fill(query)
  }
}
export default BlogPage
