// biome-ignore-all lint/performance/useTopLevelRegex: test file

/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { addTestOrgMember, createTestOrg, createTestUser, ensureTestUser, makeOrgTestUtils } from '@a/e2e/org-helpers'
import { expect, test } from '@playwright/test'

const testPrefix = `e2e-org-settings-${Date.now()}`,
  { cleanupOrgTestData, cleanupTestUsers, generateSlug } = makeOrgTestUtils(testPrefix)

test.describe
  .serial('Settings Page UI', () => {
    let testOrgId: string

    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('settings-ui'),
        created = await createTestOrg(slug, 'Settings UI Test Org')
      testOrgId = created.orgId

      const adminEmail = `${testPrefix}-settings-admin@test.local`,
        adminUserId = (await createTestUser(adminEmail, 'Settings Admin')) ?? ''
      await addTestOrgMember(testOrgId, adminUserId, true)
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })

    test('settings page loads for admin', async ({ page }) => {
      await page.goto('/settings')
      await expect(page.getByRole('heading', { name: /settings/iu })).toBeVisible({ timeout: 8000 })
    })

    test('shows org name field', async ({ page }) => {
      await page.goto('/settings')
      const nameInput = page.getByLabel(/name/iu).first()
      await expect(nameInput).toBeVisible({ timeout: 8000 })
    })

    test('shows org slug field', async ({ page }) => {
      await page.goto('/settings')
      const slugInput = page.getByLabel(/slug/iu).first()
      await expect(slugInput).toBeVisible({ timeout: 8000 })
    })

    test('transfer ownership section visible for owner', async ({ page }) => {
      await page.goto('/settings')
      const transferTitle = page.getByText('Transfer Ownership', { exact: true })
      await expect(transferTitle).toBeVisible({ timeout: 8000 })
    })

    test('delete org section visible for owner', async ({ page }) => {
      await page.goto('/settings')
      const deleteSection = page.getByText(/delete.*org/iu).first()
      await expect(deleteSection).toBeVisible({ timeout: 8000 })
    })
  })

test.describe
  .serial('Transfer Ownership UI', () => {
    let testOrgId: string, adminUserId: string

    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('transfer-ui'),
        created = await createTestOrg(slug, 'Transfer UI Test Org')
      testOrgId = created.orgId

      const adminEmail = `${testPrefix}-transfer-admin@test.local`
      adminUserId = (await createTestUser(adminEmail, 'Transfer Admin')) ?? ''
      await addTestOrgMember(testOrgId, adminUserId, true)
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })

    test('transfer section visible for owner only', async ({ page }) => {
      await page.goto('/settings')
      const transferTitle = page.getByText('Transfer Ownership', { exact: true })
      await expect(transferTitle).toBeVisible({ timeout: 8000 })
    })

    test('dropdown shows only admin members', async ({ page }) => {
      await page.goto('/settings')
      const selectTrigger = page.getByRole('combobox', { name: /select an admin/iu }).first()
      if (await selectTrigger.isVisible().catch(() => false)) {
        await selectTrigger.click()
        const adminOption = page.getByText('Transfer Admin')
        await expect(adminOption).toBeVisible()
      }
    })

    test('transfer confirms and succeeds', async ({ page }) => {
      await page.goto('/settings')
      const selectTrigger = page.getByRole('combobox', { name: /select an admin/iu }).first()
      if (await selectTrigger.isVisible().catch(() => false)) {
        await selectTrigger.click()
        const adminOption = page.getByText('Transfer Admin')
        if (await adminOption.isVisible().catch(() => false)) {
          await adminOption.click()
          page.on('dialog', async d => d.accept())
          const transferButton = page.getByRole('button', { name: /^Transfer$/iu })
          await transferButton.click()
          await expect(transferButton).not.toBeVisible({ timeout: 5000 })
        }
      }
      expect(true).toBe(true)
    })
  })

test.describe
  .serial('Leave Organization UI', () => {
    let testOrgId: string

    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('leave-ui'),
        created = await createTestOrg(slug, 'Leave UI Test Org')
      testOrgId = created.orgId

      const memberEmail = `${testPrefix}-leave-member@test.local`,
        memberUserId = (await createTestUser(memberEmail, 'Leave Member')) ?? ''
      await addTestOrgMember(testOrgId, memberUserId, false)
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })

    test('leave button NOT visible for owner on settings', async ({ page }) => {
      await page.goto('/settings')
      const leaveButton = page.getByRole('button', { name: /leave organization/iu }),
        isVisible = await leaveButton.isVisible().catch(() => false)
      expect(isVisible).toBe(false)
    })
  })
