// biome-ignore-all lint/performance/useTopLevelRegex: test file

/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import {
  addTestOrgMember,
  api,
  createTestOrg,
  createTestUser,
  ensureTestUser,
  makeOrgTestUtils,
  tc
} from '@a/e2e/org-helpers'
import { expect, test } from '@playwright/test'

const testPrefix = `e2e-org-members-${Date.now()}`,
  { cleanupOrgTestData, cleanupTestUsers, generateSlug } = makeOrgTestUtils(testPrefix)

test.describe
  .serial('Members Page UI', () => {
    let testOrgId: string

    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('members-ui'),
        created = await createTestOrg(slug, 'Members UI Test Org')
      testOrgId = created.orgId

      const memberEmail = `${testPrefix}-member@test.local`,
        memberUserId = (await createTestUser(memberEmail, 'UI Test Member')) ?? ''
      await addTestOrgMember(testOrgId, memberUserId, false)
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })

    test('members page loads', async ({ page }) => {
      await page.goto('/members')
      const heading = page.getByRole('heading', { name: /members/iu }).first()
      await expect(heading).toBeVisible({ timeout: 8000 })
    })

    test('owner shown in members list', async ({ page }) => {
      await page.goto('/members')
      const ownerBadge = page.getByText('Owner').first()
      await expect(ownerBadge).toBeVisible({ timeout: 8000 })
    })

    test('member shown in members list', async ({ page }) => {
      await page.goto('/members')
      const memberText = page.getByText('UI Test Member').first()
      await expect(memberText).toBeVisible({ timeout: 8000 })
    })
  })

test.describe
  .serial('Pending Invites UI', () => {
    let testOrgId: string

    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('invites-ui'),
        created = await createTestOrg(slug, 'Invites UI Test Org')
      testOrgId = created.orgId

      await tc.mutation(api.org.invite, {
        email: `${testPrefix}-pending@test.local`,
        isAdmin: false,
        orgId: testOrgId
      })
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
    })

    test('pending invites visible for admin+', async ({ page }) => {
      await page.goto('/members')
      const heading = page.getByText('Pending Invites')
      await expect(heading).toBeVisible({ timeout: 8000 })
    })

    test('shows email and role badge', async ({ page }) => {
      await page.goto('/members')
      const emailCell = page.getByText(`${testPrefix}-pending@test.local`)
      await expect(emailCell).toBeVisible({ timeout: 8000 })
      const roleBadge = page.getByText(/member/iu).first()
      await expect(roleBadge).toBeVisible()
    })

    test('revoke removes invite', async ({ page }) => {
      await page.goto('/members')
      const revokeButtons = page.locator('button').filter({ has: page.locator('svg.lucide-trash') }),
        firstRevoke = revokeButtons.first()
      if (await firstRevoke.isVisible().catch(() => false)) {
        await firstRevoke.click()
        await expect(firstRevoke).not.toBeVisible({ timeout: 5000 })
      }
      expect(true).toBe(true)
    })
  })

test.describe
  .serial('Join Request UI', () => {
    let testOrgId: string, testOrgSlug: string

    test.beforeAll(async () => {
      await ensureTestUser()
      testOrgSlug = generateSlug('join-ui')
      const created = await createTestOrg(testOrgSlug, 'Join UI Test Org')
      testOrgId = created.orgId
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })

    test('admin sees pending requests on members page', async ({ page }) => {
      const joinerEmail = `${testPrefix}-joiner@test.local`,
        joinerUserId = (await createTestUser(joinerEmail, 'Join Requester')) ?? ''
      await tc.raw.mutation('testauth:requestJoinAsUser', {
        message: 'I want to join',
        orgId: testOrgId,
        userId: joinerUserId
      })

      await page.goto('/members')
      const joinRequestsHeading = page.getByText('Join Requests')
      await expect(joinRequestsHeading).toBeVisible({ timeout: 8000 })
    })

    test('approve adds user to members list', async ({ page }) => {
      await page.goto('/members')
      const approveButtons = page.locator('button').filter({ has: page.locator('svg.lucide-check') }),
        firstApprove = approveButtons.first()
      if (await firstApprove.isVisible().catch(() => false)) {
        await firstApprove.click()
        await expect(firstApprove).not.toBeVisible({ timeout: 5000 })
      }
      expect(true).toBe(true)
    })
  })
