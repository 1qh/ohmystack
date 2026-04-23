/* eslint-disable no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Playwright actions */
// biome-ignore-all lint/style/useConsistentMemberAccessibility: x
import type { Locator } from '@playwright/test'
import BasePage from '@a/e2e/base-page'
class PollPage extends BasePage {
  public async createPoll(question: string, options: string[]): Promise<void> {
    await this.getQuestionInput().fill(question)
    for (let i = 0; i < options.length; i += 1) {
      const input = this.getOptionInput(i)
      const visible = await input.isVisible().catch(() => false)
      if (!visible) await this.getAddOptionButton().click()
      await this.getOptionInput(i).fill(options[i] ?? '')
    }
    await this.getCreateSubmit().click()
  }
  public getAddOptionButton(): Locator {
    return this.$('poll-options', 'button').last()
  }
  public getBanner(): Locator {
    return this.$('poll-banner')
  }
  public getCreateSubmit(): Locator {
    return this.$('poll-create-submit')
  }
  public getOptionInput(i: number): Locator {
    return this.$('poll-options', `input[name="options.${i}"]`)
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
