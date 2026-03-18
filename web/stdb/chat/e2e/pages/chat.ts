// biome-ignore-all lint/style/useConsistentMemberAccessibility: x
// biome-ignore-all lint/performance/useTopLevelRegex: x
import type { Locator } from '@playwright/test'

import BaseChatPage from '@a/e2e/base-chat'

class ChatPage extends BaseChatPage {
  protected readonly basePath = '/'
  protected readonly urlPattern = /\/[a-z0-9]+/iu

  public async abortStream(): Promise<void> {
    await this.getStopButton().click()
  }

  public async approveToolCall(): Promise<void> {
    await this.getApproveButton().click()
  }

  public async createNewChat(): Promise<void> {
    await this.page.click('[data-testid="new-chat-button"]')
    await this.page.waitForURL('/')
  }

  public async denyToolCall(): Promise<void> {
    await this.getDenyButton().click()
  }

  public getApproveButton(): Locator {
    return this.page.getByTestId('approve-button')
  }

  public getDenyButton(): Locator {
    return this.page.getByTestId('deny-button')
  }

  public getPublicChatItems(): Locator {
    return this.$$('public-chat-item')
  }

  public getPublicChatsButton(): Locator {
    return this.$('public-chats-button')
  }

  public getPublicChatsPage(): Locator {
    return this.$('public-chats-page')
  }

  public getPublicToggle(): Locator {
    return this.$('public-toggle')
  }

  public getToolApprovalCard(): Locator {
    return this.page.getByTestId('tool-approval-card')
  }

  public async gotoPublicChats(): Promise<void> {
    await this.page.goto('/public')
    await this.page.waitForLoadState('domcontentloaded')
  }

  public async togglePublic(): Promise<void> {
    await this.getPublicToggle().click()
  }
}

export default ChatPage
