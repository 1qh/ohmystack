import path from 'node:path'

import { expect, test } from './fixtures'
import { login } from './helpers'

test.describe
  .serial('Profile - Create', () => {
    test.beforeEach(async () => {
      await login()
    })

    test('shows empty profile form when no profile exists', async ({ profilePage }) => {
      await profilePage.goto()
      await expect(profilePage.getProfilePage()).toBeVisible()
      await expect(profilePage.getProfileForm()).toBeVisible()
      await expect(profilePage.getDisplayNameInput()).toBeVisible()
      await expect(profilePage.getDisplayNameInput()).toHaveValue('')
    })

    test('can fill and submit profile form', async ({ profilePage }) => {
      await profilePage.goto()
      await profilePage.fillProfile({
        bio: 'Test bio content',
        displayName: `Test User ${Date.now()}`
      })
      await profilePage.submit()
      await expect(profilePage.getToast('Profile saved')).toBeVisible({ timeout: 5000 })
    })

    test('profile data persists after page reload', async ({ profilePage }) => {
      await profilePage.goto()
      const name = `Persist ${Date.now()}`
      await profilePage.fillProfile({ bio: 'Persist bio', displayName: name })
      await profilePage.submit()
      await expect(profilePage.getToast('Profile saved')).toBeVisible({ timeout: 5000 })

      await profilePage.reload()
      await profilePage.getProfilePage().waitFor()
      await expect(profilePage.getDisplayNameInput()).toHaveValue(name, { timeout: 10_000 })
    })
  })

test.describe
  .serial('Profile - Update', () => {
    test.beforeEach(async ({ profilePage }) => {
      await login()
      await profilePage.goto()
    })

    test('can update display name', async ({ profilePage }) => {
      const newName = `Updated ${Date.now()}`
      await profilePage.fillProfile({ displayName: newName })
      await profilePage.submit()
      await expect(profilePage.getToast('Profile saved')).toBeVisible({ timeout: 5000 })

      await profilePage.reload()
      await profilePage.getProfilePage().waitFor()
      await expect(profilePage.getDisplayNameInput()).toHaveValue(newName, { timeout: 10_000 })
    })

    test('can update bio', async ({ profilePage }) => {
      const newBio = `Bio ${Date.now()}`
      await profilePage.fillProfile({ bio: newBio })
      await profilePage.submit()
      await expect(profilePage.getToast('Profile saved')).toBeVisible({ timeout: 5000 })

      await profilePage.reload()
      await profilePage.getProfilePage().waitFor()
      await expect(profilePage.getBioTextarea()).toHaveValue(newBio, { timeout: 10_000 })
    })

    test('can change theme', async ({ profilePage }) => {
      await profilePage.fillProfile({ displayName: `Theme ${Date.now()}`, theme: 'Dark' })
      await profilePage.submit()
      await expect(profilePage.getToast('Profile saved')).toBeVisible({ timeout: 5000 })
    })

    test('can toggle notifications', async ({ profilePage }) => {
      await profilePage.fillProfile({ displayName: `Notif ${Date.now()}` })
      const toggle = profilePage.getNotificationsToggle()
      await toggle.click()
      await profilePage.submit()
      await expect(profilePage.getToast('Profile saved')).toBeVisible({ timeout: 5000 })
    })
  })

test.describe
  .serial('Profile - Avatar', () => {
    test.beforeEach(async ({ profilePage }) => {
      await login()
      await profilePage.goto()
    })

    test('can upload avatar image', async ({ profilePage }) => {
      await profilePage.fillProfile({ displayName: `Avatar ${Date.now()}` })
      await profilePage.uploadAvatar(path.join(import.meta.dirname, 'fixtures', 'test-avatar.png'))
      await expect(profilePage.getAvatarPreview()).toBeVisible({ timeout: 10_000 })
      await profilePage.submit()
      await expect(profilePage.getToast('Profile saved')).toBeVisible({ timeout: 5000 })
    })

    test('avatar preview persists after reload', async ({ profilePage }) => {
      await expect(profilePage.getAvatarPreview()).toBeVisible({ timeout: 10_000 })
    })

    test('can replace avatar with new image', async ({ profilePage }) => {
      await expect(profilePage.getAvatarPreview()).toBeVisible({ timeout: 10_000 })
      const oldSrc = await profilePage.getAvatarPreview().getAttribute('src')
      await profilePage.getAvatarRemoveButton().click()
      await expect(profilePage.getAvatarDropzone()).toBeVisible({ timeout: 5000 })
      await profilePage.fillProfile({ displayName: `Replace ${Date.now()}` })
      await profilePage.uploadAvatar(path.join(import.meta.dirname, 'fixtures', 'test-avatar-2.png'))
      await expect(profilePage.getAvatarPreview()).toBeVisible({ timeout: 10_000 })
      await profilePage.submit()
      await expect(profilePage.getToast('Profile saved')).toBeVisible({ timeout: 5000 })

      await profilePage.reload()
      await profilePage.getProfilePage().waitFor()
      await expect(profilePage.getAvatarPreview()).toBeVisible({ timeout: 10_000 })
      const newSrc = await profilePage.getAvatarPreview().getAttribute('src')
      expect(newSrc).not.toBe(oldSrc)
    })

    test('can remove avatar', async ({ profilePage }) => {
      await expect(profilePage.getAvatarPreview()).toBeVisible({ timeout: 10_000 })
      await profilePage.getAvatarRemoveButton().click()
      await profilePage.fillProfile({ displayName: `Remove ${Date.now()}` })
      await profilePage.submit()
      await expect(profilePage.getToast('Profile saved')).toBeVisible({ timeout: 5000 })

      await profilePage.reload()
      await profilePage.getProfilePage().waitFor()
      await expect(profilePage.getAvatarDropzone()).toBeVisible({ timeout: 10_000 })
      await expect(profilePage.getAvatarPreview()).not.toBeVisible()
    })
  })

test.describe
  .serial('Profile - Navigation', () => {
    test.beforeEach(async () => {
      await login()
    })

    test('profile link is visible in layout', async ({ page, profilePage }) => {
      await page.goto('/')
      await page.locator('[data-testid="blog-list"], [data-testid="empty-state"]').first().waitFor()
      await expect(profilePage.getProfileLink()).toBeVisible()
    })

    test('clicking profile link navigates to /profile', async ({ page, profilePage }) => {
      await page.goto('/')
      await page.locator('[data-testid="blog-list"], [data-testid="empty-state"]').first().waitFor()
      await profilePage.getProfileLink().click()
      await expect(page).toHaveURL('/profile')
      await expect(profilePage.getProfilePage()).toBeVisible()
    })

    test('can navigate back from profile page', async ({ page, profilePage }) => {
      await profilePage.goto()
      await profilePage.fillProfile({ displayName: 'nav test' })
      await profilePage.getBackLink().click()
      await page.getByRole('button', { name: 'Discard' }).click()
      await expect(page).toHaveURL('/', { timeout: 5000 })
    })
  })
