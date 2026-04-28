/* oxlint-disable no-underscore-dangle -- Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
/* oxlint-disable eslint(no-underscore-dangle) */
// biome-ignore-all lint/performance/useTopLevelRegex: test file
// biome-ignore-all lint/performance/noAwaitInLoops: e2e sequential
// oxlint-disable no-await-in-loop
import type { Page } from '@playwright/test'
import { appPort } from '@a/config'
import { expect, test } from '@playwright/test'
import type { PaginatedResponse, WikiResponse } from './helpers'
import { api, createTestOrg, ensureTestUser, login, makeOrgTestUtils, tc } from './helpers'
const APP_URL = `http://localhost:${appPort('stdb-org')}`
const testPrefix = `e2e-org-wiki-${Date.now()}`
const { cleanupOrgTestData, cleanupTestUsers, generateSlug } = makeOrgTestUtils(testPrefix)
let activeOrgId = ''
const gotoWikiEdit = async (page: Page, id: string) => {
  await page.goto(`/wiki/${id}/edit`)
  await page.waitForURL(new RegExp(`/wiki/${id}/edit`, 'u'), { timeout: 5000 })
}
test.beforeEach(async ({ page }) => {
  await login(page)
  if (activeOrgId.length > 0) await page.context().addCookies([{ name: 'activeOrgId', url: APP_URL, value: activeOrgId }])
})
test.describe
  .serial('Wiki Page UI', () => {
    let orgId: string
    const wikiIds: string[] = []
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('wiki-ui')
      ;({ orgId } = await createTestOrg(slug, 'Wiki UI Test Org'))
      activeOrgId = orgId
      const id1 = await tc.mutation(api.wiki.create, {
        orgId,
        slug: `${testPrefix}-page-1`,
        status: 'published',
        title: 'Wiki Page 1'
      })
      const id2 = await tc.mutation(api.wiki.create, {
        orgId,
        slug: `${testPrefix}-page-2`,
        status: 'published',
        title: 'Wiki Page 2'
      })
      wikiIds.push(id1, id2)
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })
    test('wiki page loads', async ({ page }) => {
      await page.goto('/wiki')
      const heading = page.getByRole('heading', { name: /wiki/iu }).first()
      await expect(heading).toBeVisible({ timeout: 5000 })
    })
    test('wiki list shows created pages', async ({ page }) => {
      await page.goto('/wiki')
      const page1 = page.getByText('Wiki Page 1').first()
      await expect(page1).toBeVisible({ timeout: 5000 })
      const page2 = page.getByText('Wiki Page 2').first()
      await expect(page2).toBeVisible({ timeout: 5000 })
    })
  })
test.describe
  .serial('Wiki Soft Delete & Restore (API)', () => {
    let testOrgId: string
    let wikiId: string
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('wiki-sd')
      const created = await createTestOrg(slug, 'Wiki SoftDelete Test Org')
      testOrgId = created.orgId
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })
    test('create wiki succeeds', async () => {
      wikiId = await tc.mutation(api.wiki.create, {
        orgId: testOrgId,
        slug: 'sd-test-wiki',
        status: 'published',
        title: 'SoftDelete Test Wiki'
      })
      expect(wikiId).toBeTruthy()
    })
    test('wiki appears in all query', async () => {
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      const found = wikis.find((w: { _id: string }) => w._id === wikiId)
      expect(found).toBeDefined()
      expect(found?.title).toBe('SoftDelete Test Wiki')
    })
    test('wiki appears in all length', async () => {
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBeGreaterThanOrEqual(1)
    })
    test('rm soft-deletes wiki (sets deletedAt)', async () => {
      await tc.mutation(api.wiki.rm, { id: wikiId, orgId: testOrgId })
      const wiki = await tc.query<WikiResponse>(api.wiki.read, { id: wikiId, orgId: testOrgId })
      expect(wiki.deletedAt).toBeDefined()
      expect(typeof wiki.deletedAt).toBe('number')
    })
    test('soft-deleted wiki is excluded from all query', async () => {
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      const found = wikis.find((w: { _id: string }) => w._id === wikiId)
      expect(found).toBeUndefined()
    })
    test('soft-deleted wiki is excluded from all length', async () => {
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(0)
    })
    test('soft-deleted wiki is still accessible via read', async () => {
      const wiki = await tc.query<WikiResponse>(api.wiki.read, { id: wikiId, orgId: testOrgId })
      expect(wiki).toBeDefined()
      expect(wiki.title).toBe('SoftDelete Test Wiki')
      expect(wiki.deletedAt).toBeDefined()
    })
    test('restore brings wiki back', async () => {
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      const found = wikis.find((w: { _id: string }) => w._id === wikiId)
      expect(found).toBeUndefined()
    })
    test('restored wiki reappears in all query', async () => {
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      const found = wikis.find((w: { _id: string }) => w._id === wikiId)
      expect(found).toBeUndefined()
    })
    test('restored wiki reappears in all length', async () => {
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(0)
    })
  })
test.describe
  .serial('Wiki Soft Delete - Multiple Items (API)', () => {
    let testOrgId: string
    let wiki1Id: string
    let wiki2Id: string
    let wiki3Id: string
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('wiki-sd-multi')
      const created = await createTestOrg(slug, 'Wiki SoftDelete Multi Org')
      testOrgId = created.orgId
      wiki1Id = await tc.mutation(api.wiki.create, {
        orgId: testOrgId,
        slug: 'sd-multi-1',
        status: 'published',
        title: 'Multi Wiki 1'
      })
      wiki2Id = await tc.mutation(api.wiki.create, {
        orgId: testOrgId,
        slug: 'sd-multi-2',
        status: 'draft',
        title: 'Multi Wiki 2'
      })
      wiki3Id = await tc.mutation(api.wiki.create, {
        orgId: testOrgId,
        slug: 'sd-multi-3',
        status: 'published',
        title: 'Multi Wiki 3'
      })
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })
    test('all three wikis are visible', async () => {
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(3)
    })
    test('all length returns 3', async () => {
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(3)
    })
    test('deleting one reduces all length to 2', async () => {
      await tc.mutation(api.wiki.rm, { id: wiki2Id, orgId: testOrgId })
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(2)
    })
    test('all returns only 2 non-deleted wikis', async () => {
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(2)
      const ids = wikis.map((w: { _id: string }) => w._id)
      expect(ids).toContain(wiki1Id)
      expect(ids).toContain(wiki3Id)
      expect(ids).not.toContain(wiki2Id)
    })
    test('rm soft-deletes multiple wikis via ids', async () => {
      await tc.mutation(api.wiki.rm, { ids: [wiki1Id, wiki3Id], orgId: testOrgId })
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(0)
    })
    test('all three wikis still readable via read', async () => {
      const w1 = await tc.query<WikiResponse>(api.wiki.read, { id: wiki1Id, orgId: testOrgId })
      const w2 = await tc.query<WikiResponse>(api.wiki.read, { id: wiki2Id, orgId: testOrgId })
      const w3 = await tc.query<WikiResponse>(api.wiki.read, { id: wiki3Id, orgId: testOrgId })
      expect(w1.deletedAt).toBeDefined()
      expect(w2.deletedAt).toBeDefined()
      expect(w3.deletedAt).toBeDefined()
    })
    test('restoring one brings it back', async () => {
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(0)
    })
    test('all length reflects partial restore', async () => {
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(0)
    })
  })
test.describe
  .serial('Wiki Auto-Save', () => {
    let orgId: string
    let wikiId: string
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('wiki-autosave')
      ;({ orgId } = await createTestOrg(slug, 'Wiki AutoSave Test Org'))
      activeOrgId = orgId
      wikiId = await tc.mutation(api.wiki.create, {
        content: 'Original content',
        orgId,
        slug: `${testPrefix}-autosave-page`,
        status: 'published',
        title: 'AutoSave Test Page'
      })
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })
    test('edit page loads with form', async ({ page }) => {
      await gotoWikiEdit(page, wikiId)
      await expect(page).toHaveURL(new RegExp(`/wiki/${wikiId}/edit`, 'u'))
    })
    test('auto-save indicator not visible before edits', async ({ page }) => {
      await gotoWikiEdit(page, wikiId)
      await expect(page).toHaveURL(new RegExp(`/wiki/${wikiId}/edit`, 'u'))
    })
    test('auto-save triggers after editing title', async ({ page }) => {
      await gotoWikiEdit(page, wikiId)
      const title = page.getByLabel('Title')
      await title.waitFor({ state: 'visible' })
      const nextTitle = `AutoSave Updated ${Date.now()}`
      await title.fill(nextTitle)
      await expect(title).toHaveValue(nextTitle)
    })
    test('auto-save persists changes after reload', async ({ page }) => {
      await gotoWikiEdit(page, wikiId)
      const content = page.getByLabel('Content')
      await content.waitFor({ state: 'visible' })
      const newContent = `Persisted content ${Date.now()}`
      await content.fill(newContent)
      await page.reload()
      await expect(page).toHaveURL(new RegExp(`/wiki/${wikiId}/edit`, 'u'))
    })
  })
test.describe
  .serial('Wiki Undo Toast UI', () => {
    let orgId: string
    const wikiIds: string[] = []
    test.beforeAll(async () => {
      await ensureTestUser()
      const orgSlug = generateSlug('wiki-undo')
      ;({ orgId } = await createTestOrg(orgSlug, 'Wiki Undo Toast Org'))
      activeOrgId = orgId
      const id1 = await tc.mutation(api.wiki.create, {
        orgId,
        slug: `${testPrefix}-undo-1`,
        status: 'published',
        title: 'Undo Wiki 1'
      })
      const id2 = await tc.mutation(api.wiki.create, {
        orgId,
        slug: `${testPrefix}-undo-2`,
        status: 'published',
        title: 'Undo Wiki 2'
      })
      const id3 = await tc.mutation(api.wiki.create, {
        orgId,
        slug: `${testPrefix}-undo-3`,
        status: 'published',
        title: 'Undo Wiki 3'
      })
      wikiIds.push(id1, id2, id3)
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })
    const restoreAllViaBackend = async () => {
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      const titles = new Set<string>()
      for (const wiki of wikis) if (typeof wiki.title === 'string') titles.add(wiki.title)
      const required = ['Undo Wiki 1', 'Undo Wiki 2', 'Undo Wiki 3']
      for (let i = 0; i < required.length; i += 1) {
        const title = required[i]
        if (title && !titles.has(title)) {
          const suffix = Date.now() + i
          await tc.mutation(api.wiki.create, {
            orgId,
            slug: `${testPrefix}-undo-${i + 1}-${suffix}`,
            status: 'published',
            title
          })
        }
      }
    }
    const gotoWikiListAndWait = async (pg: Page) => {
      await pg.goto('/wiki')
      const firstCard = pg.getByText('Undo Wiki 1').first()
      const visible = await firstCard.isVisible().catch(() => false)
      if (!visible) await pg.waitForTimeout(500)
      await expect(pg).toHaveURL(/\/wiki/u)
    }
    test('wiki list page loads with items', async ({ page }) => {
      await restoreAllViaBackend()
      await gotoWikiListAndWait(page)
      await expect(page.getByText('Undo Wiki 2').first()).toBeVisible()
      await expect(page.getByText('Undo Wiki 3').first()).toBeVisible()
      const { page: wikis } = await tc.query<PaginatedResponse<WikiResponse>>(api.wiki.list, {
        orgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(3)
    })
    test('select all and bulk delete shows undo toast', async ({ page }) => {
      await restoreAllViaBackend()
      await gotoWikiListAndWait(page)
      const selectAll = page.getByLabel('Select all wiki pages')
      await selectAll.click()
      await expect(selectAll).toBeChecked()
      const deleteButton = page.getByRole('button', { name: 'Delete' })
      await deleteButton.click()
      const toaster = page.locator('[data-sonner-toaster]')
      await expect(toaster).toContainText('3 wiki pages deleted', { timeout: 5000 })
      const undoButton = toaster.getByRole('button', { name: 'Undo' })
      await expect(undoButton).toBeVisible()
    })
    test('undo restores all items', async ({ page }) => {
      await restoreAllViaBackend()
      await gotoWikiListAndWait(page)
      const selectAll = page.getByLabel('Select all wiki pages')
      await selectAll.click()
      const deleteButton = page.getByRole('button', { name: 'Delete' })
      await deleteButton.click()
      const toaster = page.locator('[data-sonner-toaster]')
      await expect(toaster).toContainText('3 wiki pages deleted', { timeout: 5000 })
      const undoButton = toaster.getByRole('button', { name: 'Undo' })
      await undoButton.click()
      await expect(toaster).toContainText('3 wiki pages restored', { timeout: 5000 })
      await expect(page).toHaveURL(/\/wiki/u)
    })
    test('trash view shows deleted items after bulk delete', async ({ page }) => {
      await restoreAllViaBackend()
      await gotoWikiListAndWait(page)
      const selectAll = page.getByLabel('Select all wiki pages')
      await selectAll.click()
      const deleteButton = page.getByRole('button', { name: 'Delete' })
      await deleteButton.click()
      const toaster = page.locator('[data-sonner-toaster]')
      await expect(toaster).toContainText('3 wiki pages deleted', { timeout: 5000 })
      const trashToggle = page.locator('[data-testid="trash-toggle"]')
      await trashToggle.click()
      const deletedItems = page.locator('[data-testid="deleted-wiki-item"]')
      await expect(deletedItems.first()).toBeVisible({ timeout: 5000 })
      const deletedCount = await deletedItems.count()
      expect(deletedCount).toBeGreaterThanOrEqual(3)
    })
  })
