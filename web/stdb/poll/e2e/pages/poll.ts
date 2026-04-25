/* eslint-disable no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Playwright actions */
// biome-ignore-all lint/style/useConsistentMemberAccessibility: x
import type { Locator } from '@playwright/test'
import BasePage from '@a/e2e/base-page'
class PollPage extends BasePage {
  public async clearBanner(): Promise<void> {
    await this.getBannerClear().click()
  }
  public async createPoll(question: string, options: string[]): Promise<void> {
    const qInput = this.getQuestionInput()
    await qInput.waitFor({ state: 'visible', timeout: 15_000 })
    await qInput.fill(question)
    const tagInput = this.getOptionsTagInput()
    for (const opt of options) {
      await tagInput.fill(opt)
      await tagInput.press('Enter')
    }
    await this.getCreateSubmit().click()
    await this.page
      .getByTestId('poll-item')
      .filter({ hasText: question })
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
  }
  public getBanner(): Locator {
    return this.$('poll-banner')
  }
  public getBannerActiveInput(): Locator {
    return this.$('banner-active-input')
  }
  public getBannerClear(): Locator {
    return this.$('banner-clear')
  }
  public getBannerMessageInput(): Locator {
    return this.$('banner-message-input')
  }
  public getBannerRestore(): Locator {
    return this.$('banner-restore')
  }
  public getBannerSave(): Locator {
    return this.$('banner-save')
  }
  public getBannerState(): Locator {
    return this.$('banner-state')
  }
  public getCreateSubmit(): Locator {
    return this.$('poll-create-submit')
  }
  public getLoadMore(): Locator {
    return this.$('poll-load-more')
  }
  public getOptionsTagInput(): Locator {
    return this.$('poll-options', 'input')
  }
  public getPollItems(): Locator {
    return this.$$('poll-item')
  }
  public getQuestionInput(): Locator {
    return this.$('poll-question', 'input')
  }
  public getQuotaRemaining(): Locator {
    return this.$('quota-remaining')
  }
  public getSearchInput(): Locator {
    return this.$('poll-search-input')
  }
  public getVoteBulk(): Locator {
    return this.$('vote-bulk')
  }
  public getVoteButton(i: number): Locator {
    return this.$(`vote-option-${i}`)
  }
  public getVoteCount(i: number): Locator {
    return this.$(`vote-count-${i}`)
  }
  public getVotePurge(): Locator {
    return this.$('vote-purge')
  }
  public getVoteRestore(): Locator {
    return this.$('vote-restore')
  }
  public getVoteView(): Locator {
    return this.$('vote-view')
  }
  public async goto(path = '/'): Promise<void> {
    await this.page.goto(path)
    await this.waitForConnection()
  }
  public async openPoll(question: string): Promise<Locator> {
    const item = this.getPollItems().filter({ hasText: question }).first()
    await item.getByRole('button', { name: question }).click()
    return item
  }
  public async saveBanner(message: string, active = true): Promise<void> {
    const input = this.getBannerMessageInput()
    await input.waitFor({ state: 'visible', timeout: 15_000 })
    await this.page.waitForFunction(
      (id: string) => {
        const el = document.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)
        return el !== null && !el.disabled
      },
      'banner-message-input',
      { timeout: 15_000 }
    )
    await input.click({ force: true, timeout: 15_000 })
    await input.fill(message, { force: true, timeout: 15_000 })
    const activeBox = this.getBannerActiveInput()
    if ((await activeBox.isChecked()) !== active) await activeBox.click()
    await this.getBannerSave().click()
  }
}
export default PollPage
