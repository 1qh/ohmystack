import BasePage from '@a/e2e/base-page'

class SessionListPage extends BasePage {
  getNewButton = () => this.page.getByRole('button', { name: /new/iu })

  getSessionCards = () => this.page.locator('button').filter({ has: this.page.locator('.font-medium') })

  getTitle = () => this.page.getByRole('heading', { name: /sessions/iu })

  goto = async (path: '/' = '/') => {
    await this.page.goto(path)
  }
}

export default SessionListPage
