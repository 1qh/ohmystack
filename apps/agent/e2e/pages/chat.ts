import BasePage from '@a/e2e/base-page'

class ChatPage extends BasePage {
  getComposer = () => this.page.getByPlaceholder(/message/iu)

  getMessages = () => this.page.locator('.is-user, .is-assistant')

  getMessageLog = () => this.page.getByRole('log')

  getSendButton = () => this.page.getByRole('button', { name: /send/iu })

  getTitle = () => this.page.locator('h1')

  sendMessage = async (content: string) => {
    await this.getComposer().fill(content)
    await this.getSendButton().click()
  }
}

export default ChatPage
