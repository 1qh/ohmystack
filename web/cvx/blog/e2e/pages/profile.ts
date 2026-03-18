// biome-ignore-all lint/style/useConsistentMemberAccessibility: x
import type { Locator } from '@playwright/test'

import BasePage from '@a/e2e/base-page'

class ProfilePage extends BasePage {
  public async fillProfile(data: { bio?: string; displayName?: string; theme?: string }): Promise<void> {
    if (data.displayName !== undefined) {
      const input = this.getDisplayNameInput()
      await input.clear()
      await input.fill(data.displayName)
    }
    if (data.bio !== undefined) {
      const textarea = this.getBioTextarea()
      await textarea.clear()
      await textarea.fill(data.bio)
    }
    if (data.displayName !== undefined || data.bio !== undefined || data.theme !== undefined) {
      const themeName = data.theme ?? 'System'
      await this.getThemeSelect().click()
      await this.page.getByRole('option', { name: themeName }).click()
    }
  }

  public getAvatarDropzone(): Locator {
    return this.$('profile-avatar', '[role="button"]')
  }

  public getAvatarInput(): Locator {
    return this.$('profile-avatar', 'input[type="file"]')
  }

  public getAvatarPreview(): Locator {
    return this.$('profile-avatar', 'img')
  }

  public getAvatarRemoveButton(): Locator {
    return this.$('profile-avatar', 'button')
  }

  public getBackLink(): Locator {
    return this.$('profile-back')
  }

  public getBioTextarea(): Locator {
    return this.$('profile-bio', 'textarea')
  }

  public getDisplayNameInput(): Locator {
    return this.$('profile-displayName', 'input')
  }

  public getNotificationsToggle(): Locator {
    return this.$('profile-notifications', 'button[role="switch"]')
  }

  public getProfileForm(): Locator {
    return this.$('profile-form')
  }

  public getProfileLink(): Locator {
    return this.$('profile-link')
  }

  public getProfilePage(): Locator {
    return this.$('profile-page')
  }

  public getSubmitButton(): Locator {
    return this.$('profile-submit')
  }

  public getThemeSelect(): Locator {
    return this.$('profile-theme', 'button')
  }

  public getToast(text: string): Locator {
    return this.page.getByText(text)
  }

  public async goto(): Promise<void> {
    await this.page.goto('/profile')
    await this.page.locator('[data-testid="profile-page"]').waitFor()
  }

  public async reload(): Promise<void> {
    await this.page.reload()
  }

  public async submit(): Promise<void> {
    await this.getSubmitButton().click()
  }

  public async uploadAvatar(filePath: string): Promise<void> {
    const [fileChooser] = await Promise.all([this.page.waitForEvent('filechooser'), this.getAvatarDropzone().click()])
    await fileChooser.setFiles(filePath)
  }
}

export default ProfilePage
