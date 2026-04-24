/* eslint-disable no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Playwright actions */
// biome-ignore-all lint/style/useConsistentMemberAccessibility: x
import type { Locator } from '@playwright/test'
import BasePage from '@a/e2e/base-page'
class PollPage extends BasePage {
  public async createPoll(question: string, options: string[]): Promise<void> {
    const qInput = this.getQuestionInput()
    await qInput.waitFor({ state: 'visible', timeout: 15_000 })
    await qInput.scrollIntoViewIfNeeded()
    await qInput.pressSequentially(question, { delay: 10 })
    const tagInput = this.getOptionsTagInput()
    for (const opt of options) {
      await tagInput.focus()
      await tagInput.pressSequentially(opt, { delay: 10 })
      await tagInput.press('Enter')
    }
    await this.getCreateSubmit().click()
  }
  public getBanner(): Locator {
    return this.$('poll-banner')
  }
  public getCreateSubmit(): Locator {
    return this.$('poll-create-submit')
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
  public getVoteButton(i: number): Locator {
    return this.$(`vote-option-${i}`)
  }
  public getVoteView(): Locator {
    return this.$('vote-view')
  }
  public async goto(path = '/'): Promise<void> {
    await this.page.goto(path)
    await this.waitForConnection()
  }
}
export default PollPage
