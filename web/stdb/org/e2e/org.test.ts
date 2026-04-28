/* oxlint-disable no-underscore-dangle -- Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
/* oxlint-disable eslint(no-underscore-dangle) */
// biome-ignore-all lint/performance/useTopLevelRegex: test file
import { expect, test } from '@playwright/test'
import type { InviteResponse, MemberResponse, OrgMembershipResponse, OrgResponse, OrgWithRole } from './helpers'
import {
  addTestOrgMember,
  api,
  createTestOrg,
  createTestUser,
  ensureTestUser,
  expectError,
  login,
  makeOrgTestUtils,
  removeTestOrgMember,
  tc
} from './helpers'
const testPrefix = `e2e-org-app-${Date.now()}`
const { cleanupOrgTestData, cleanupTestUsers, generateSlug } = makeOrgTestUtils(testPrefix)
const readStringId = (value: unknown): string => {
  if (typeof value === 'string' && value.length > 0) return value
  throw new TypeError('Expected non-empty string id')
}
test.describe
  .serial('Org Dashboard', () => {
    let testOrgSlug: string
    test.beforeAll(async () => {
      await ensureTestUser()
      testOrgSlug = generateSlug('dash')
      await createTestOrg(testOrgSlug, 'Dashboard Test Org')
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
    })
    test.beforeEach(async ({ page }) => {
      await login(page)
    })
    test('dashboard loads with org info', async ({ page }) => {
      await page.goto('/dashboard')
      const heading = page.getByRole('heading').first()
      await expect(heading).toBeVisible({ timeout: 10_000 })
    })
    test('dashboard shows members card', async ({ page }) => {
      await page.goto('/dashboard')
      const membersCard = page.getByText('Members').first()
      await expect(membersCard).toBeVisible({ timeout: 8000 })
    })
    test('dashboard shows projects card', async ({ page }) => {
      await page.goto('/dashboard')
      const projectsCard = page.getByText('Projects').first()
      await expect(projectsCard).toBeVisible({ timeout: 8000 })
    })
    test('view all members link navigates to /members', async ({ page }) => {
      await page.goto('/dashboard')
      const link = page.getByRole('link', { name: /view all members/iu })
      await expect(link).toBeVisible({ timeout: 8000 })
      await link.click()
      await expect(page).toHaveURL(/\/members/u)
    })
    test('view all projects link navigates to /projects', async ({ page }) => {
      await page.goto('/dashboard')
      const link = page.getByRole('link', { name: /view all projects/iu })
      await expect(link).toBeVisible({ timeout: 8000 })
      await link.click()
      await expect(page).toHaveURL(/\/projects/u)
    })
  })
test.describe
  .serial('Org Navigation', () => {
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('nav')
      await createTestOrg(slug, 'Nav Test Org')
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
    })
    test.beforeEach(async ({ page }) => {
      await login(page)
    })
    test('nav has Dashboard link', async ({ page }) => {
      await page.goto('/dashboard')
      const link = page.getByRole('link', { name: /dashboard/iu }).first()
      await expect(link).toBeVisible({ timeout: 8000 })
    })
    test('nav has Projects link', async ({ page }) => {
      await page.goto('/dashboard')
      const link = page.getByRole('link', { name: /projects/iu }).first()
      await expect(link).toBeVisible({ timeout: 8000 })
    })
    test('nav has Wiki link', async ({ page }) => {
      await page.goto('/dashboard')
      const link = page.getByRole('link', { name: /wiki/iu }).first()
      await expect(link).toBeVisible({ timeout: 8000 })
    })
    test('nav has Members link', async ({ page }) => {
      await page.goto('/dashboard')
      const link = page.getByRole('link', { name: /members/iu }).first()
      await expect(link).toBeVisible({ timeout: 8000 })
    })
    test('nav has Settings link', async ({ page }) => {
      await page.goto('/dashboard')
      const link = page.getByRole('link', { name: /settings/iu }).first()
      await expect(link).toBeVisible({ timeout: 8000 })
    })
  })
test.describe
  .serial('Org CRUD (API)', () => {
    test.beforeAll(async () => {
      await ensureTestUser()
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
    })
    test('create org - success', async () => {
      const slug = generateSlug('create')
      const result = await createTestOrg(slug, 'Test Org')
      expect(result.orgId).toBeDefined()
    })
    test('create org - creator becomes owner', async () => {
      const slug = generateSlug('owner')
      const result = await createTestOrg(slug, 'Owner Test Org')
      const org = await tc.query<null | OrgResponse>(api.org.get, { orgId: result.orgId })
      expect(org).toBeDefined()
      expect(org?.userId).toBeDefined()
    })
    test('create org - duplicate slug fails', async () => {
      const slug = generateSlug('dupe')
      await createTestOrg(slug, 'First Org')
      const result = await expectError(async () =>
        tc.mutation(api.org.create, {
          data: { name: 'Second Org', slug }
        })
      )
      expect(result).toHaveProperty('code', 'ORG_SLUG_TAKEN')
    })
    test('get org - success', async () => {
      const slug = generateSlug('get')
      const created = await createTestOrg(slug, 'Get Test Org')
      const org = await tc.query<null | OrgResponse>(api.org.get, { orgId: created.orgId })
      expect(org?.name).toBe('Get Test Org')
      expect(org?.slug).toBe(slug)
    })
    test('myOrgs - includes created org', async () => {
      const slug = generateSlug('myorgs')
      const created = await createTestOrg(slug, 'MyOrgs Test')
      const orgs = await tc.query<OrgWithRole[]>(api.org.myOrgs, {})
      const found = orgs.find(o => o.org._id === created.orgId)
      expect(found).toBeDefined()
      expect(found?.role).toBe('owner')
    })
    test('update org - owner can update name', async () => {
      const slug = generateSlug('update-name')
      const created = await createTestOrg(slug, 'Original Name')
      await tc.mutation(api.org.update, {
        data: { name: 'Updated Name' },
        orgId: created.orgId
      })
      const org = await tc.query<null | OrgResponse>(api.org.get, { orgId: created.orgId })
      expect(org?.name).toBe('Updated Name')
    })
    test('remove org - owner can delete', async () => {
      const slug = generateSlug('remove')
      const created = await createTestOrg(slug, 'Remove Test')
      await tc.mutation(api.org.remove, { orgId: created.orgId })
      const result = await tc.query<null | OrgResponse>(api.org.getBySlug, { slug })
      expect(result).toBeNull()
    })
  })
test.describe
  .serial('Org Membership (API)', () => {
    let testOrgId: string
    let memberUserId: string
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('membership')
      const created = await createTestOrg(slug, 'Membership Test Org')
      testOrgId = created.orgId
      const memberEmail = `${testPrefix}-member@test.local`
      memberUserId = readStringId(await createTestUser(memberEmail, 'Test Member'))
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })
    test('membership - owner has owner role', async () => {
      const result = await tc.query<null | OrgMembershipResponse>(api.org.membership, {
        orgId: testOrgId
      })
      expect(result?.role).toBe('owner')
    })
    test('members - shows owner', async () => {
      const members = await tc.query<MemberResponse[]>(api.org.members, { orgId: testOrgId })
      expect(members.length).toBeGreaterThanOrEqual(1)
      const owner = members.find(m => m.role === 'owner')
      expect(owner).toBeDefined()
    })
    test('add member via test helper - success', async () => {
      const memberId = readStringId(await addTestOrgMember(testOrgId, memberUserId, false))
      expect(memberId).toBeDefined()
      const members = await tc.query<MemberResponse[]>(api.org.members, { orgId: testOrgId })
      const found = members.find(m => m.userId === memberUserId)
      expect(found).toBeDefined()
      expect(found?.role).toBe('member')
    })
    test('removeMember - owner can remove member', async () => {
      const tempEmail = `${testPrefix}-temp@test.local`
      const tempUserId = readStringId(await createTestUser(tempEmail, 'Temp Member'))
      const tempMemberId = readStringId(await addTestOrgMember(testOrgId, tempUserId, false))
      await tc.mutation(api.org.removeMember, { memberId: tempMemberId })
      const members = await tc.query<MemberResponse[]>(api.org.members, { orgId: testOrgId })
      const found = members.find(m => m.userId === tempUserId)
      expect(found).toBeUndefined()
    })
    test('leave - member can leave org', async () => {
      const leaveEmail = `${testPrefix}-leave@test.local`
      const leaveUserId = readStringId(await createTestUser(leaveEmail, 'Leave Member'))
      await addTestOrgMember(testOrgId, leaveUserId, false)
      await removeTestOrgMember(testOrgId, leaveUserId)
      const members = await tc.query<MemberResponse[]>(api.org.members, { orgId: testOrgId })
      const found = members.find(m => m.userId === leaveUserId)
      expect(found).toBeUndefined()
    })
  })
test.describe
  .serial('Org Invite Flow (API)', () => {
    let testOrgId: string
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('invite')
      const created = await createTestOrg(slug, 'Invite Test Org')
      testOrgId = created.orgId
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })
    test('invite - owner can create invite', async () => {
      const result = await tc.mutation<InviteResponse>(api.org.invite, {
        email: 'invited@example.com',
        isAdmin: false,
        orgId: testOrgId
      })
      expect(result.inviteId).toBeDefined()
      expect(result.token).toBeDefined()
      expect(result.token.length).toBe(32)
    })
    test('pendingInvites - shows created invites', async () => {
      const invites = await tc.query<InviteResponse[]>(api.org.pendingInvites, { orgId: testOrgId })
      expect(invites.length).toBeGreaterThanOrEqual(1)
    })
    test('revokeInvite - owner can revoke', async () => {
      const invite = await tc.mutation<InviteResponse>(api.org.invite, {
        email: 'revoke-me@example.com',
        isAdmin: false,
        orgId: testOrgId
      })
      await tc.mutation(api.org.revokeInvite, { inviteId: invite.inviteId })
      const invites = await tc.query<InviteResponse[]>(api.org.pendingInvites, { orgId: testOrgId })
      const found = invites.find(i => i._id === invite.inviteId)
      expect(found).toBeUndefined()
    })
    test('acceptInvite - invalid token fails', async () => {
      const result = await expectError(async () =>
        tc.mutation(api.org.acceptInvite, {
          token: 'invalid-token-12345678901234567890'
        })
      )
      expect(result).toHaveProperty('code', 'INVALID_INVITE')
    })
  })
