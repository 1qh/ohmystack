// biome-ignore-all lint/style/useConsistentMemberAccessibility: x
import type { Locator, Page } from '@playwright/test'

class BasePage {
  protected readonly page: Page

  public constructor(page: Page) {
    this.page = page
  }

  protected $(testId: string, nested?: string): Locator {
    const loc = this.page.getByTestId(testId)
    return nested ? loc.locator(nested) : loc
  }

  protected $$(testId: string): Locator {
    return this.page.locator(`[data-testid="${testId}"]`)
  }
}

export default BasePage
