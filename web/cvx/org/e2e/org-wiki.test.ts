// biome-ignore-all lint/performance/useTopLevelRegex: test file
// oxlint-disable no-await-in-loop
/* eslint-disable no-await-in-loop */
import type { Page } from '@playwright/test'
import { api, createTestOrg, ensureTestUser, makeOrgTestUtils, tc } from '@a/e2e/org-helpers'
import { expect, test } from '@playwright/test'
const testPrefix = `e2e-org-wiki-${Date.now()}`,
  { cleanupOrgTestData, cleanupTestUsers, generateSlug } = makeOrgTestUtils(testPrefix),
  expectSingle = <T>(value: T | T[]): T => {
    if (Array.isArray(value)) {
      const [first] = value
      if (first !== undefined) return first
      throw new Error('Expected at least one value')
    }
    return value
  },
  gotoWikiEdit = async (page: Page, id: string) => {
    await page.goto(`/wiki/${id}/edit`)
    const heading = page.getByText('Edit wiki page')
    if (await heading.isVisible().catch(() => false)) return
    if (
      await page
        .getByText('404')
        .isVisible()
        .catch(() => false)
    ) {
      await page.waitForLoadState('load')
      await page.goto(`/wiki/${id}/edit`)
    }
    await expect(heading).toBeVisible({ timeout: 10_000 })
  }
test.describe
  .serial('Wiki Page UI', () => {
    let orgId: string
    const wikiIds: string[] = []
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('wiki-ui')
      ;({ orgId } = await createTestOrg(slug, 'Wiki UI Test Org'))
      const id1 = expectSingle(
          await tc.mutation(api.wiki.create, {
            orgId,
            slug: `${testPrefix}-page-1`,
            status: 'published',
            title: 'Wiki Page 1'
          })
        ),
        id2 = expectSingle(
          await tc.mutation(api.wiki.create, {
            orgId,
            slug: `${testPrefix}-page-2`,
            status: 'published',
            title: 'Wiki Page 2'
          })
        )
      wikiIds.push(id1, id2)
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })
    test('wiki page loads', async ({ page }) => {
      await page.goto('/wiki')
      const heading = page.getByRole('heading', { name: /wiki/iu }).first()
      await expect(heading).toBeVisible({ timeout: 8000 })
    })
    test('wiki list shows created pages', async ({ page }) => {
      await page.goto('/wiki')
      const page1 = page.getByText('Wiki Page 1').first()
      await expect(page1).toBeVisible({ timeout: 8000 })
      const page2 = page.getByText('Wiki Page 2').first()
      await expect(page2).toBeVisible({ timeout: 8000 })
    })
  })
test.describe
  .serial('Wiki Soft Delete & Restore (API)', () => {
    let testOrgId: string, wikiId: string
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('wiki-sd'),
        created = await createTestOrg(slug, 'Wiki SoftDelete Test Org')
      testOrgId = created.orgId
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })
    test('create wiki succeeds', async () => {
      wikiId = expectSingle(
        await tc.mutation(api.wiki.create, {
          orgId: testOrgId,
          slug: 'sd-test-wiki',
          status: 'published',
          title: 'SoftDelete Test Wiki'
        })
      )
      expect(wikiId).toBeTruthy()
    })
    test('wiki appears in all query', async () => {
      const { page: wikis } = await tc.query(api.wiki.list, {
          orgId: testOrgId,
          paginationOpts: { cursor: null, numItems: 100 }
        }),
        found = wikis.find((w: { _id: string }) => w._id === wikiId)
      expect(found).toBeDefined()
      expect(found?.title).toBe('SoftDelete Test Wiki')
    })
    test('wiki appears in all length', async () => {
      const { page: wikis } = await tc.query(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBeGreaterThanOrEqual(1)
    })
    test('rm soft-deletes wiki (sets deletedAt)', async () => {
      await tc.mutation(api.wiki.rm, { id: wikiId, orgId: testOrgId })
      const wiki = await tc.query(api.wiki.read, { id: wikiId, orgId: testOrgId })
      expect(wiki.deletedAt).toBeDefined()
      expect(typeof wiki.deletedAt).toBe('number')
    })
    test('soft-deleted wiki is excluded from all query', async () => {
      const { page: wikis } = await tc.query(api.wiki.list, {
          orgId: testOrgId,
          paginationOpts: { cursor: null, numItems: 100 }
        }),
        found = wikis.find((w: { _id: string }) => w._id === wikiId)
      expect(found).toBeUndefined()
    })
    test('soft-deleted wiki is excluded from all length', async () => {
      const { page: wikis } = await tc.query(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(0)
    })
    test('soft-deleted wiki is still accessible via read', async () => {
      const wiki = await tc.query(api.wiki.read, { id: wikiId, orgId: testOrgId })
      expect(wiki).toBeDefined()
      expect(wiki.title).toBe('SoftDelete Test Wiki')
      expect(wiki.deletedAt).toBeDefined()
    })
    test('restore brings wiki back', async () => {
      await tc.raw.mutation('wiki:restore', { id: wikiId, orgId: testOrgId })
      const wiki = await tc.query(api.wiki.read, { id: wikiId, orgId: testOrgId })
      expect(wiki.deletedAt).toBeUndefined()
    })
    test('restored wiki reappears in all query', async () => {
      const { page: wikis } = await tc.query(api.wiki.list, {
          orgId: testOrgId,
          paginationOpts: { cursor: null, numItems: 100 }
        }),
        found = wikis.find((w: { _id: string }) => w._id === wikiId)
      expect(found).toBeDefined()
      expect(found?.title).toBe('SoftDelete Test Wiki')
    })
    test('restored wiki reappears in all length', async () => {
      const { page: wikis } = await tc.query(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBeGreaterThanOrEqual(1)
    })
  })
test.describe
  .serial('Wiki Soft Delete - Multiple Items (API)', () => {
    let testOrgId: string, wiki1Id: string, wiki2Id: string, wiki3Id: string
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('wiki-sd-multi'),
        created = await createTestOrg(slug, 'Wiki SoftDelete Multi Org')
      testOrgId = created.orgId
      wiki1Id = expectSingle(
        await tc.mutation(api.wiki.create, {
          orgId: testOrgId,
          slug: 'sd-multi-1',
          status: 'published',
          title: 'Multi Wiki 1'
        })
      )
      wiki2Id = expectSingle(
        await tc.mutation(api.wiki.create, {
          orgId: testOrgId,
          slug: 'sd-multi-2',
          status: 'draft',
          title: 'Multi Wiki 2'
        })
      )
      wiki3Id = expectSingle(
        await tc.mutation(api.wiki.create, {
          orgId: testOrgId,
          slug: 'sd-multi-3',
          status: 'published',
          title: 'Multi Wiki 3'
        })
      )
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })
    test('all three wikis are visible', async () => {
      const { page: wikis } = await tc.query(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(3)
    })
    test('all length returns 3', async () => {
      const { page: wikis } = await tc.query(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(3)
    })
    test('deleting one reduces all length to 2', async () => {
      await tc.mutation(api.wiki.rm, { id: wiki2Id, orgId: testOrgId })
      const { page: wikis } = await tc.query(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(2)
    })
    test('all returns only 2 non-deleted wikis', async () => {
      const { page: wikis } = await tc.query(api.wiki.list, {
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
      const { page: wikis } = await tc.query(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(0)
    })
    test('all three wikis still readable via read', async () => {
      const w1 = await tc.query(api.wiki.read, { id: wiki1Id, orgId: testOrgId }),
        w2 = await tc.query(api.wiki.read, { id: wiki2Id, orgId: testOrgId }),
        w3 = await tc.query(api.wiki.read, { id: wiki3Id, orgId: testOrgId })
      expect(w1.deletedAt).toBeDefined()
      expect(w2.deletedAt).toBeDefined()
      expect(w3.deletedAt).toBeDefined()
    })
    test('restoring one brings it back', async () => {
      await tc.raw.mutation('wiki:restore', { id: wiki2Id, orgId: testOrgId })
      const { page: wikis } = await tc.query(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(1)
      expect(wikis[0]?._id).toBe(wiki2Id)
    })
    test('all length reflects partial restore', async () => {
      const { page: wikis } = await tc.query(api.wiki.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 100 }
      })
      expect(wikis.length).toBe(1)
    })
  })
test.describe
  .serial('Wiki Auto-Save', () => {
    let orgId: string, wikiId: string
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('wiki-autosave')
      ;({ orgId } = await createTestOrg(slug, 'Wiki AutoSave Test Org'))
      wikiId = expectSingle(
        await tc.mutation(api.wiki.create, {
          content: 'Original content',
          orgId,
          slug: `${testPrefix}-autosave-page`,
          status: 'published',
          title: 'AutoSave Test Page'
        })
      )
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })
    test('edit page loads with form', async ({ page }) => {
      await gotoWikiEdit(page, wikiId)
      await expect(page.getByLabel('Title')).toBeVisible()
    })
    test('auto-save indicator not visible before edits', async ({ page }) => {
      await gotoWikiEdit(page, wikiId)
      await expect(page.getByTestId('auto-save-indicator')).not.toBeVisible()
    })
    test('auto-save triggers after editing title', async ({ page }) => {
      await gotoWikiEdit(page, wikiId)
      await page.getByLabel('Title').fill(`AutoSave Updated ${Date.now()}`)
      await expect(page.getByTestId('auto-save-indicator')).toBeVisible({ timeout: 5000 })
      await expect(page.getByTestId('auto-save-indicator')).toContainText('Saved', { timeout: 5000 })
    })
    test('auto-save persists changes after reload', async ({ page }) => {
      await gotoWikiEdit(page, wikiId)
      const newContent = `Persisted content ${Date.now()}`
      await page.getByLabel('Content').fill(newContent)
      await expect(page.getByTestId('auto-save-indicator')).toContainText('Saved', { timeout: 5000 })
      await page.reload()
      await expect(page.getByText('Edit wiki page')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByLabel('Content')).toHaveValue(newContent)
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
      const id1 = expectSingle(
          await tc.mutation(api.wiki.create, {
            orgId,
            slug: `${testPrefix}-undo-1`,
            status: 'published',
            title: 'Undo Wiki 1'
          })
        ),
        id2 = expectSingle(
          await tc.mutation(api.wiki.create, {
            orgId,
            slug: `${testPrefix}-undo-2`,
            status: 'published',
            title: 'Undo Wiki 2'
          })
        ),
        id3 = expectSingle(
          await tc.mutation(api.wiki.create, {
            orgId,
            slug: `${testPrefix}-undo-3`,
            status: 'published',
            title: 'Undo Wiki 3'
          })
        )
      wikiIds.push(id1, id2, id3)
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })
    const wikiRestore = (api.wiki as typeof api.wiki & { restore: typeof api.wiki.rm }).restore,
      restoreAllViaBackend = async () => {
        for (const id of wikiIds)
          try {
            // biome-ignore lint/performance/noAwaitInLoops: sequential restore
            await tc.mutation(wikiRestore, { id, orgId })
          } catch {
            // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
          }
      },
      gotoWikiListAndWait = async (pg: Page) => {
        await pg.goto('/wiki')
        const firstCard = pg.getByText('Undo Wiki 1').first(),
          visible = await firstCard.isVisible().catch(() => false)
        if (!visible) {
          await pg.waitForTimeout(2000)
          await pg.reload()
        }
        await expect(firstCard).toBeVisible({ timeout: 10_000 })
      }
    test('wiki list page loads with items', async ({ page }) => {
      await restoreAllViaBackend()
      await gotoWikiListAndWait(page)
      await expect(page.getByText('Undo Wiki 2').first()).toBeVisible()
      await expect(page.getByText('Undo Wiki 3').first()).toBeVisible()
      const { page: wikis } = await tc.query(api.wiki.list, { orgId, paginationOpts: { cursor: null, numItems: 100 } })
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
      await expect(page.getByText('Undo Wiki 1').first()).toBeVisible({ timeout: 8000 })
      await expect(page.getByText('Undo Wiki 2').first()).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('Undo Wiki 3').first()).toBeVisible({ timeout: 5000 })
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
      await expect(deletedItems).toHaveCount(3, { timeout: 5000 })
    })
  })
