// biome-ignore-all lint/style/useConsistentMemberAccessibility: x
import type { Locator } from '@playwright/test'

import BasePage from '@a/e2e/base-page'

class OnboardingPage extends BasePage {
  public async clickNext(): Promise<void> {
    await this.$('step-next').click()
  }

  public async clickPrev(): Promise<void> {
    await this.$('step-prev').click()
  }

  public async clickSubmit(): Promise<void> {
    await this.$('step-submit').click()
  }

  public async fillOrg(data: { name: string; slug: string }): Promise<void> {
    const nameInput = this.getOrgNameInput()
    await nameInput.fill(data.name)
    const slugInput = this.getOrgSlugInput()
    await slugInput.fill(data.slug)
  }

  public async fillPreferences(data: { notifications?: boolean; theme?: string }): Promise<void> {
    if (data.theme !== undefined) {
      await this.getThemeSelect().click()
      await this.page.getByRole('option', { name: data.theme.charAt(0).toUpperCase() + data.theme.slice(1) }).click()
    }
    if (data.notifications !== undefined) {
      const toggle = this.getNotificationsToggle()
      if (((await toggle.getAttribute('aria-checked')) === 'true') !== data.notifications) await toggle.click()
    }
  }

  public async fillProfile(data: { bio?: string; displayName?: string }): Promise<void> {
    if (data.displayName !== undefined) {
      const input = this.getDisplayNameInput()
      await input.fill(data.displayName)
    }
    if (data.bio !== undefined) {
      const textarea = this.getBioTextarea()
      await textarea.fill(data.bio)
    }
  }

  public getAvatarInput(): Locator {
    return this.page.locator('[data-testid="avatar"] input[type="file"]')
  }

  public getBioTextarea(): Locator {
    return this.page.getByLabel('Bio')
  }

  public getDisplayNameInput(): Locator {
    return this.page.getByLabel('Display Name')
  }

  public getErrorAlert(): Locator {
    return this.page.locator('[role="alert"]')
  }

  public getFieldError(): Locator {
    return this.page.locator('[data-slot="field-error"]').first()
  }

  public getNavGuardDialog(): Locator {
    return this.page.getByText('You have unsaved changes')
  }

  public getNextButton(): Locator {
    return this.$('step-next')
  }

  public getNotificationsToggle(): Locator {
    return this.page.getByRole('switch')
  }

  public getOrgAvatarInput(): Locator {
    return this.page.locator('[data-testid="orgAvatar"] input[type="file"]')
  }

  public getOrgNameInput(): Locator {
    return this.page.getByLabel('Name', { exact: true })
  }

  public getOrgSlugInput(): Locator {
    return this.page.getByLabel('URL Slug')
  }

  public getPrevButton(): Locator {
    return this.$('step-prev')
  }

  public getStepForm(): Locator {
    return this.$('step-form')
  }

  public getStepIndicator(id: string): Locator {
    return this.$(`step-indicator-${id}`)
  }

  public getSubmitButton(): Locator {
    return this.$('step-submit')
  }

  public getThemeSelect(): Locator {
    return this.page.getByRole('combobox')
  }

  public getToast(text: string): Locator {
    return this.page.locator('[data-sonner-toaster]').getByText(text)
  }

  public async goto(): Promise<void> {
    await this.page.goto('/onboarding')
    await this.page.locator('[data-testid="step-form"]').waitFor({ timeout: 5000 })
  }
}

export default OnboardingPage
