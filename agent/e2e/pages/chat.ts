import BasePage from '@a/e2e/base-page'
const MESSAGE_RE = /message/iu
const SEND_RE = /send/iu
class ChatPage extends BasePage {
  getComposer = () => this.page.getByPlaceholder(MESSAGE_RE)
  getMessageLog = () => this.page.getByRole('log')
  getMessages = () => this.page.locator('.is-user, .is-assistant')
  getSendButton = () => this.page.getByRole('button', { name: SEND_RE })
  getTitle = () => this.page.locator('h1')
  sendMessage = async (content: string) => {
    await this.getComposer().fill(content)
    await this.getSendButton().click()
  }
}
export default ChatPage
