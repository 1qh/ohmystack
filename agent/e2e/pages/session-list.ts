import BasePage from '@a/e2e/base-page'
const NEW_RE = /new/iu,
  SESSIONS_RE = /sessions/iu
class SessionListPage extends BasePage {
  getNewButton = () => this.page.getByRole('button', { name: NEW_RE })
  getSessionCards = () => this.page.locator('button').filter({ has: this.page.locator('.font-medium') })
  getTitle = () => this.page.getByRole('heading', { name: SESSIONS_RE })
  goto = async (path = '/') => {
    await this.page.goto(path)
  }
}
export default SessionListPage
