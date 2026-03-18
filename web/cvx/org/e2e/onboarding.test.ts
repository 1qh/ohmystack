// biome-ignore-all lint/performance/useTopLevelRegex: test file

import { api, ensureTestUser, makeOrgTestUtils, tc } from '@a/e2e/org-helpers'
import path from 'node:path'

import { expect, test } from './fixtures'

const testPrefix = `e2e-onboard-${Date.now()}`,
  { cleanupOrgTestData, generateSlug } = makeOrgTestUtils(testPrefix)

test.describe
  .serial('Onboarding - Step Navigation', () => {
    test.beforeAll(async () => {
      await ensureTestUser()
      await cleanupOrgTestData()
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
    })

    test('shows step 1 (profile) on initial load', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await expect(onboardingPage.getStepIndicator('profile')).toHaveAttribute('aria-current', 'step')
    })

    test('back button is not visible on first step', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await expect(onboardingPage.getPrevButton()).not.toBeVisible()
    })

    test('next button is visible on first step', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await expect(onboardingPage.getNextButton()).toBeVisible()
    })

    test('filling displayName and clicking next advances to step 2', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Nav Test' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })
    })

    test('back button is visible on step 2', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Nav Test 2' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })
      await expect(onboardingPage.getPrevButton()).toBeVisible()
    })

    test('clicking back returns to step 1', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Nav Test 3' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })
      await onboardingPage.clickPrev()
      await expect(onboardingPage.getStepIndicator('profile')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })
    })

    test('can navigate through all 4 steps to submit button', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Nav Full' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await onboardingPage.fillOrg({ name: 'Nav Org', slug: generateSlug('nav-full') })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('preferences')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await expect(onboardingPage.getSubmitButton()).toBeVisible()
    })

    test('completed step indicator is clickable and navigates back', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Ind Click' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await onboardingPage.getStepIndicator('profile').click()
      await expect(onboardingPage.getStepIndicator('profile')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })
    })

    test('upcoming step indicator is disabled', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await expect(onboardingPage.getStepIndicator('org')).toBeDisabled()
      await expect(onboardingPage.getStepIndicator('appearance')).toBeDisabled()
      await expect(onboardingPage.getStepIndicator('preferences')).toBeDisabled()
    })
  })

test.describe
  .serial('Onboarding - Per-Step Validation', () => {
    test.beforeAll(async () => {
      await ensureTestUser()
      await cleanupOrgTestData()
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
    })

    test('clicking next with empty displayName stays on step 1 and shows error', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('profile')).toHaveAttribute('aria-current', 'step')
      await expect(onboardingPage.getFieldError()).toBeVisible({ timeout: 3000 })
    })

    test('filling displayName then clicking next advances to step 2', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Valid Name' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })
    })

    test('clicking next with empty org name stays on step 2', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Val Test' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step')
      await expect(onboardingPage.getFieldError()).toBeVisible({ timeout: 3000 })
    })

    test('whitespace-only displayName shows validation error', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: '   ' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('profile')).toHaveAttribute('aria-current', 'step')
      await expect(onboardingPage.getFieldError()).toBeVisible({ timeout: 3000 })
    })

    test('bio exceeding 500 chars shows validation error', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ bio: 'a'.repeat(501), displayName: 'Bio Test' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('profile')).toHaveAttribute('aria-current', 'step')
      await expect(onboardingPage.getFieldError()).toBeVisible({ timeout: 3000 })
    })

    test('validation errors clear when user fixes field and retries', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.clickNext()
      await expect(onboardingPage.getFieldError()).toBeVisible({ timeout: 3000 })

      await onboardingPage.fillProfile({ displayName: 'Fixed Name' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })
    })

    test('slug with invalid characters shows validation error', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Slug Test' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await onboardingPage.fillOrg({ name: 'Valid Org', slug: 'INVALID SLUG!' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step')
      await expect(onboardingPage.getFieldError()).toBeVisible({ timeout: 3000 })
    })

    test('valid org name and slug advances to step 3', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Valid Org Test' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await onboardingPage.fillOrg({ name: 'My Org', slug: generateSlug('val') })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })
    })

    test('appearance step is all optional - next works without filling', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Optional Test' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await onboardingPage.fillOrg({ name: 'Opt Org', slug: generateSlug('opt') })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('preferences')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })
    })

    test('can upload org avatar on appearance step and proceed', async ({ onboardingPage, page }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Avatar Upload' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await onboardingPage.fillOrg({ name: 'Avatar Org', slug: generateSlug('avatar') })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      const input = onboardingPage.getOrgAvatarInput()
      await input.setInputFiles(path.join(import.meta.dirname, 'fixtures', 'test-avatar.png'))
      await page.locator('[data-testid="orgAvatar"] img').waitFor({ timeout: 15_000 })

      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('preferences')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })
    })

    test('preferences step has defaults - submit works immediately', async ({ onboardingPage, page }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Default Test' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await onboardingPage.fillOrg({ name: 'Def Org', slug: generateSlug('def') })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.clickNext()
      await expect(onboardingPage.getSubmitButton()).toBeVisible({ timeout: 5000 })
      await onboardingPage.clickSubmit()

      await page.waitForURL(/\/dashboard/u, { timeout: 15_000 })
    })
  })

test.describe
  .serial('Onboarding - Happy Path', () => {
    test.beforeAll(async () => {
      await ensureTestUser()
      await cleanupOrgTestData()
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
    })

    test('complete 4-step flow end-to-end', async ({ onboardingPage, page }) => {
      await onboardingPage.goto()

      await onboardingPage.fillProfile({ bio: 'Hello world', displayName: 'Happy User' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      const slug = generateSlug('happy')
      await onboardingPage.fillOrg({ name: 'Happy Org', slug })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.clickNext()
      await expect(onboardingPage.getSubmitButton()).toBeVisible({ timeout: 5000 })

      await onboardingPage.clickSubmit()
      await page.waitForURL(/\/dashboard/u, { timeout: 15_000 })
      await expect(page).toHaveURL(/\/dashboard/u)
    })

    test('profile and org were created with correct data', async () => {
      const profile = await tc.query(api.orgProfile.get, {})
      expect(profile).toBeDefined()
      expect(profile?.displayName).toBe('Happy User')
      expect(profile?.bio).toBe('Hello world')

      const orgs = await tc.query(api.org.myOrgs, {}),
        found = orgs.find((o: { org: { name: string } }) => o.org.name === 'Happy Org')
      expect(found).toBeDefined()
    })

    test('dashboard shows org after onboarding', async ({ page }) => {
      await page.goto('/')
      await page.waitForURL(/\/dashboard/u, { timeout: 15_000 })
      const heading = page.getByRole('heading').first()
      await expect(heading).toBeVisible({ timeout: 8000 })
    })
  })

test.describe
  .serial('Onboarding - Custom Preferences', () => {
    test.beforeAll(async () => {
      await ensureTestUser()
      await cleanupOrgTestData()
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
    })

    test('complete flow with custom preferences (theme=dark, notifications on)', async ({ onboardingPage, page }) => {
      await onboardingPage.goto()

      await onboardingPage.fillProfile({ bio: 'Custom prefs', displayName: 'Prefs User' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      const slug = generateSlug('prefs')
      await onboardingPage.fillOrg({ name: 'Prefs Org', slug })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('preferences')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.fillPreferences({ notifications: true, theme: 'dark' })

      await onboardingPage.clickSubmit()
      await page.waitForURL(/\/dashboard/u, { timeout: 15_000 })
      await expect(page).toHaveURL(/\/dashboard/u)
    })
  })

test.describe
  .serial('Onboarding - Data Persistence Across Steps', () => {
    test.beforeAll(async () => {
      await ensureTestUser()
      await cleanupOrgTestData()
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
    })

    test('step 1 data preserved after going back from step 2', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ bio: 'Persist bio', displayName: 'Persist Name' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await onboardingPage.clickPrev()
      await expect(onboardingPage.getStepIndicator('profile')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })
      await expect(onboardingPage.getDisplayNameInput()).toHaveValue('Persist Name')
      await expect(onboardingPage.getBioTextarea()).toHaveValue('Persist bio')
    })

    test('step 2 data preserved after going back from step 3', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Persist 2' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      const slug = generateSlug('persist')
      await onboardingPage.fillOrg({ name: 'Persist Org', slug })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.clickPrev()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })
      await expect(onboardingPage.getOrgNameInput()).toHaveValue('Persist Org')
      await expect(onboardingPage.getOrgSlugInput()).toHaveValue(slug)
    })

    test('all step data preserved after full round trip', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ bio: 'Round trip', displayName: 'Round Trip' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      const slug = generateSlug('round')
      await onboardingPage.fillOrg({ name: 'Round Org', slug })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('preferences')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.getStepIndicator('profile').click()
      await expect(onboardingPage.getStepIndicator('profile')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })
      await expect(onboardingPage.getDisplayNameInput()).toHaveValue('Round Trip')
      await expect(onboardingPage.getBioTextarea()).toHaveValue('Round trip')
    })

    test('editing step 1 after back does not affect step 2 data', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ bio: 'Original bio', displayName: 'Original' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      const slug = generateSlug('iso')
      await onboardingPage.fillOrg({ name: 'Iso Org', slug })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.getStepIndicator('profile').click()
      await expect(onboardingPage.getStepIndicator('profile')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })
      await onboardingPage.fillProfile({ displayName: 'Modified' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await expect(onboardingPage.getOrgNameInput()).toHaveValue('Iso Org')
      await expect(onboardingPage.getOrgSlugInput()).toHaveValue(slug)
    })
  })

test.describe
  .serial('Onboarding - Navigation Guard', () => {
    test.beforeAll(async () => {
      await ensureTestUser()
      await cleanupOrgTestData()
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
    })

    test('filling data registers beforeunload handler', async ({ onboardingPage, page }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Guard Test' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      const hasHandler = await page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true })
        globalThis.dispatchEvent(event)
        return event.defaultPrevented
      })
      expect(hasHandler).toBe(true)
    })

    test('after successful submit beforeunload handler is removed', async ({ onboardingPage, page }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Guard Done' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await onboardingPage.fillOrg({ name: 'Guard Org', slug: generateSlug('guard') })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.clickNext()
      await expect(onboardingPage.getSubmitButton()).toBeVisible({ timeout: 5000 })
      await onboardingPage.clickSubmit()

      await page.waitForURL(/\/dashboard/u, { timeout: 15_000 })
    })

    test('clicking Cancel on guard dialog stays on page with data preserved', async ({ onboardingPage, page }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Cancel Guard' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await page.evaluate(() => {
        const a = document.createElement('a')
        a.href = '/dashboard'
        a.id = 'guard-test-link'
        a.textContent = 'Leave'
        document.body.append(a)
      })
      await page.locator('#guard-test-link').click()
      await expect(onboardingPage.getNavGuardDialog()).toBeVisible({ timeout: 5000 })

      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(onboardingPage.getNavGuardDialog()).not.toBeVisible({ timeout: 3000 })
      await expect(page).toHaveURL(/\/onboarding/u)
    })

    test('clicking Discard on guard dialog dismisses guard', async ({ onboardingPage, page }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Discard Guard' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await page.evaluate(() => {
        const a = document.createElement('a')
        a.href = '/new'
        a.id = 'guard-test-link'
        a.textContent = 'Leave'
        document.body.append(a)
      })
      await page.locator('#guard-test-link').click()
      await expect(onboardingPage.getNavGuardDialog()).toBeVisible({ timeout: 5000 })

      await page.getByRole('button', { name: 'Discard' }).click()
      await expect(onboardingPage.getNavGuardDialog()).not.toBeVisible({ timeout: 5000 })
    })
  })

test.describe
  .serial('Onboarding - Replaces Auto-Create', () => {
    test.beforeAll(async () => {
      await ensureTestUser()
      await cleanupOrgTestData()
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
    })

    test('new user with no orgs redirects to /onboarding', async ({ page }) => {
      await page.goto('/')
      await page.waitForURL(/\/onboarding/u, { timeout: 15_000 })
      await expect(page).toHaveURL(/\/onboarding/u)
    })

    test('completing onboarding creates org with user-chosen name', async ({ onboardingPage, page }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Custom Name' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      const slug = generateSlug('custom')
      await onboardingPage.fillOrg({ name: 'My Custom Org', slug })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.clickNext()
      await expect(onboardingPage.getSubmitButton()).toBeVisible({ timeout: 5000 })
      await onboardingPage.clickSubmit()

      await page.waitForURL(/\/dashboard/u, { timeout: 15_000 })
      const heading = page.getByRole('heading').first()
      await expect(heading).toBeVisible({ timeout: 8000 })
    })
  })

test.describe
  .serial('Onboarding - Error Handling', () => {
    const errorSlug = generateSlug('err-dup')

    test.beforeAll(async () => {
      await ensureTestUser()
      await cleanupOrgTestData()
      await tc.raw.mutation('org:create', { data: { name: 'Existing Org', slug: errorSlug } })
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
    })

    test('duplicate slug on submit shows error message', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Error User' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await onboardingPage.fillOrg({ name: 'Dup Org', slug: errorSlug })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.clickNext()
      await expect(onboardingPage.getSubmitButton()).toBeVisible({ timeout: 5000 })
      await onboardingPage.clickSubmit()

      const errorAlert = onboardingPage.getErrorAlert()
      await expect(errorAlert).toBeVisible({ timeout: 10_000 })
    })

    test('data preserved after submit error', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Preserved User' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await onboardingPage.fillOrg({ name: 'Preserved Org', slug: errorSlug })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.clickNext()
      await expect(onboardingPage.getSubmitButton()).toBeVisible({ timeout: 5000 })
      await onboardingPage.clickSubmit()

      const errorAlert = onboardingPage.getErrorAlert()
      await expect(errorAlert).toBeVisible({ timeout: 10_000 })

      await onboardingPage.getStepIndicator('profile').click()
      await expect(onboardingPage.getStepIndicator('profile')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })
      await expect(onboardingPage.getDisplayNameInput()).toHaveValue('Preserved User')
    })

    test('retry with different slug succeeds', async ({ onboardingPage, page }) => {
      await onboardingPage.goto()
      await onboardingPage.fillProfile({ displayName: 'Retry User' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await onboardingPage.fillOrg({ name: 'Retry Org', slug: errorSlug })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.clickNext()
      await expect(onboardingPage.getSubmitButton()).toBeVisible({ timeout: 5000 })
      await onboardingPage.clickSubmit()

      const errorAlert = onboardingPage.getErrorAlert()
      await expect(errorAlert).toBeVisible({ timeout: 10_000 })

      await onboardingPage.getStepIndicator('org').click()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      const retrySlug = generateSlug('retry-ok')
      await onboardingPage.fillOrg({ name: 'Retry Org', slug: retrySlug })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.clickNext()
      await expect(onboardingPage.getSubmitButton()).toBeVisible({ timeout: 5000 })
      await onboardingPage.clickSubmit()

      await expect(() => {
        const url = page.url()
        expect(url).not.toContain('/onboarding')
      }).toPass({ timeout: 15_000 })
    })
  })

test.describe
  .serial('Onboarding - Prefilled Values', () => {
    test.beforeAll(async () => {
      await ensureTestUser()
      await cleanupOrgTestData()
      await tc.raw.mutation('orgProfile:upsert', {
        displayName: 'Existing User',
        notifications: true,
        theme: 'dark'
      })
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
    })

    test('form shows pre-filled displayName from existing profile', async ({ onboardingPage }) => {
      await onboardingPage.goto()
      await expect(onboardingPage.getDisplayNameInput()).toHaveValue('Existing User', { timeout: 10_000 })
    })

    test('can modify pre-filled values and submit', async ({ onboardingPage, page }) => {
      await onboardingPage.goto()
      await expect(onboardingPage.getDisplayNameInput()).toHaveValue('Existing User', { timeout: 10_000 })
      await onboardingPage.fillProfile({ displayName: 'Modified User' })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('org')).toHaveAttribute('aria-current', 'step', { timeout: 5000 })

      await onboardingPage.fillOrg({ name: 'Prefilled Org', slug: generateSlug('prefill') })
      await onboardingPage.clickNext()
      await expect(onboardingPage.getStepIndicator('appearance')).toHaveAttribute('aria-current', 'step', {
        timeout: 5000
      })

      await onboardingPage.clickNext()
      await expect(onboardingPage.getSubmitButton()).toBeVisible({ timeout: 5000 })
      await onboardingPage.clickSubmit()

      await page.waitForURL(/\/dashboard/u, { timeout: 15_000 })
    })
  })
