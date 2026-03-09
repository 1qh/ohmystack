// biome-ignore-all lint/style/useConsistentMemberAccessibility: x
// biome-ignore-all lint/performance/useTopLevelRegex: x
import type { Locator } from '@playwright/test'

import BasePage from './base-page'

abstract class BaseChatPage extends BasePage {
  protected abstract readonly basePath: string
  protected abstract readonly urlPattern: RegExp

  public getCurrentUrl(): string {
    return this.page.url()
  }

  public getDeleteButtons(): Locator {
    return this.$$('delete-thread-button')
  }

  public getEmptyState(): Locator {
    return this.$('empty-state')
  }

  public getInput(): Locator {
    return this.$('chat-input').first()
  }

  public getMessageByStatus(status: string): Locator {
    return this.page.locator(`[data-testid="message"][data-status="${status}"]`)
  }

  public getMessages(): Locator {
    return this.$$('message')
  }

  public getNewChatButton(): Locator {
    return this.$('new-chat-button')
  }

  public getSendButton(): Locator {
    return this.$('send-button').first()
  }

  public getStopButton(): Locator {
    return this.$('stop-button')
  }

  public getThreadItems(): Locator {
    return this.$$('thread-item')
  }

  public getThreadList(): Locator {
    return this.$$('thread-list')
  }

  public async goto(): Promise<void> {
    await this.page.goto(this.basePath)
    await this.waitForInputReady()
  }

  public async sendMessage(): Promise<void> {
    await this.getSendButton().click()
  }

  public async sendUserMessage(message: string): Promise<void> {
    await this.typeMessage(message)
    await this.sendMessage()
    await this.page.waitForURL(this.urlPattern, { timeout: 60_000 })
    await this.waitForInputReady()
  }

  public async typeMessage(message: string): Promise<void> {
    const input = this.getInput()
    await input.waitFor({ state: 'attached' })
    await input.fill(message)
  }

  public async waitForResponse(timeout = 30_000): Promise<void> {
    await this.page.locator('[data-testid="send-button"]').waitFor({ timeout })
    await this.page.locator('[data-testid="message"].is-assistant').last().waitFor({ timeout })
  }

  public async waitForStreamingToStart(timeout = 5000): Promise<void> {
    await this.page.locator('[data-testid="stop-button"]').waitFor({ timeout })
  }

  protected async waitForInputReady(): Promise<void> {
    const input = this.getInput()
    await input.waitFor({ state: 'visible', timeout: 10_000 })
  }
}

export default BaseChatPage
