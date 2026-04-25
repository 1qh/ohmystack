/* eslint-disable no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Playwright actions */
// biome-ignore-all lint/style/useConsistentMemberAccessibility: x
import type { Locator } from '@playwright/test'
import BasePage from '@a/e2e/base-page'
const openVoteAdmin = async (item: Locator): Promise<void> => {
  const purge = item.getByTestId('vote-purge')
  if (await purge.isVisible().catch(() => false)) return
  const trigger = item.locator('button').filter({ hasText: 'Admin actions' }).first()
  await trigger.click()
  await purge.waitFor({ state: 'visible', timeout: 5000 })
}
class PollPage extends BasePage {
  public async clearBanner(): Promise<void> {
    await this.openBannerAdmin()
    await this.getBannerClear().click()
  }
  public async createPoll(question: string, options: string[]): Promise<void> {
    await this.$('create-poll-trigger').click()
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
  public async openBannerAdmin(): Promise<void> {
    const trigger = this.$('banner-admin').locator('button').first()
    const input = this.getBannerMessageInput()
    if (!(await input.isVisible().catch(() => false))) await trigger.click()
    await input.waitFor({ state: 'visible', timeout: 10_000 })
  }
  public async openPoll(question: string): Promise<Locator> {
    const openViews = this.page.getByTestId('vote-view')
    const n = await openViews.count()
    for (let i = 0; i < n; i += 1) {
      const v = openViews.nth(i)
      if (await v.isVisible().catch(() => false)) {
        const card = this.page.getByTestId('poll-item').filter({ has: v }).first()
        const heading = card.locator('button').first()
        await heading.click()
      }
    }
    const item = this.getPollItems().filter({ hasText: question }).first()
    const trigger = item.getByRole('button', { name: question })
    await trigger.click()
    const view = item.getByTestId('vote-view')
    if (!(await view.isVisible().catch(() => false))) await trigger.click()
    await view.waitFor({ state: 'visible', timeout: 10_000 })
    await openVoteAdmin(item)
    return item
  }
  public async saveBanner(message: string, active = true): Promise<void> {
    await this.openBannerAdmin()
    const input = this.getBannerMessageInput()
    await input.click({ force: true, timeout: 15_000 })
    await input.fill(message, { force: true, timeout: 15_000 })
    const activeBox = this.getBannerActiveInput()
    const isOn = (await activeBox.getAttribute('data-checked')) !== null
    if (isOn !== active) await activeBox.click()
    await this.getBannerSave().click()
  }
}
export default PollPage
