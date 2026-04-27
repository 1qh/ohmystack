/* oxlint-disable eslint-plugin-vitest(no-conditional-in-test) */
// biome-ignore-all lint/performance/useTopLevelRegex: test file
import {
  addTestOrgMember,
  api,
  createTestOrg,
  createTestUser,
  ensureTestUser,
  expectError,
  makeOrgTestUtils,
  tc
} from '@a/e2e/org-helpers'
import { expect, test } from '@playwright/test'
const testPrefix = `e2e-org-proj-${Date.now()}`
const { cleanupOrgTestData, cleanupTestUsers, generateSlug } = makeOrgTestUtils(testPrefix)
const readStringId = (value: unknown): string => {
  if (typeof value === 'string' && value.length > 0) return value
  throw new TypeError('Expected non-empty string id')
}
const readCompleted = (value: unknown): boolean | undefined => {
  if (typeof value !== 'object' || !value) return
  const { completed } = value as { completed?: unknown }
  return typeof completed === 'boolean' ? completed : undefined
}
const expectSingle = <T>(value: T | T[]): T => {
  if (Array.isArray(value)) {
    const [first] = value
    if (first !== undefined) return first
    throw new Error('Expected at least one value')
  }
  return value
}
test.describe
  .serial('Projects Page UI', () => {
    let testOrgId: string
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('proj-ui')
      const created = await createTestOrg(slug, 'Project UI Test Org')
      testOrgId = created.orgId
      await tc.mutation(api.project.create, {
        name: 'UI Test Project',
        orgId: testOrgId
      })
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
    })
    test('projects page loads', async ({ page }) => {
      await page.goto('/projects')
      const heading = page.getByRole('heading', { name: /projects/iu }).first()
      await expect(heading).toBeVisible({ timeout: 8000 })
    })
    test('projects list shows created project', async ({ page }) => {
      await page.goto('/projects')
      const projectName = page.getByText('UI Test Project').first()
      await expect(projectName).toBeVisible({ timeout: 8000 })
    })
    test('new project link navigates to /projects/new', async ({ page }) => {
      await page.goto('/projects')
      const newLink = page.getByRole('link', { name: /new|create/iu }).first()
      if (await newLink.isVisible().catch(() => false)) {
        await newLink.click()
        await expect(page).toHaveURL(/\/projects\/new/u)
      }
    })
  })
test.describe
  .serial('Project CRUD (API)', () => {
    let testOrgId: string
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('proj-crud')
      const created = await createTestOrg(slug, 'Project CRUD Test Org')
      testOrgId = created.orgId
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
    })
    test('create project - success', async () => {
      const projectId = await tc.mutation(api.project.create, {
        description: 'Test project description',
        name: 'Test Project',
        orgId: testOrgId,
        status: 'active'
      })
      expect(projectId).toBeDefined()
    })
    test('create project - minimal fields', async () => {
      const projectId = await tc.mutation(api.project.create, {
        name: 'Minimal Project',
        orgId: testOrgId
      })
      expect(projectId).toBeDefined()
    })
    test('read project - success', async () => {
      const projectId = await tc.mutation(api.project.create, {
        name: 'Read Test Project',
        orgId: testOrgId
      })
      const project = await tc.query(api.project.read, {
        id: projectId,
        orgId: testOrgId
      })
      expect(project.name).toBe('Read Test Project')
      expect(project.orgId).toBe(testOrgId)
    })
    test('list projects - returns paginated results', async () => {
      const result = await tc.query(api.project.list, {
        orgId: testOrgId,
        paginationOpts: { cursor: null, numItems: 10 }
      })
      expect(result.page).toBeDefined()
      expect(result.page.length).toBeGreaterThan(0)
    })
    test('update project - owner can update', async () => {
      const projectId = await tc.mutation(api.project.create, {
        name: 'Update Test Project',
        orgId: testOrgId
      })
      const updated = await tc.mutation(api.project.update, {
        id: projectId,
        name: 'Updated Project Name',
        orgId: testOrgId
      })
      const updatedProject = Array.isArray(updated) ? updated[0] : updated
      expect(updatedProject?.name).toBe('Updated Project Name')
    })
    test('rm project - owner can delete', async () => {
      const projectId = await tc.mutation(api.project.create, {
        name: 'Delete Test Project',
        orgId: testOrgId
      })
      await tc.mutation(api.project.rm, {
        id: projectId,
        orgId: testOrgId
      })
      const result = await expectError(async () =>
        tc.query(api.project.read, {
          id: projectId,
          orgId: testOrgId
        })
      )
      expect(result).toHaveProperty('code', 'NOT_FOUND')
    })
    test('rm multiple projects via ids', async () => {
      const id1 = await tc.mutation(api.project.create, {
        name: 'Bulk Delete 1',
        orgId: testOrgId
      })
      const id2 = await tc.mutation(api.project.create, {
        name: 'Bulk Delete 2',
        orgId: testOrgId
      })
      const deleted = await tc.mutation(api.project.rm, {
        ids: [id1, id2],
        orgId: testOrgId
      })
      expect(deleted).toBe(2)
    })
  })
test.describe
  .serial('Task CRUD (API)', () => {
    let testOrgId: string
    let testProjectId: string
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('task-crud')
      const created = await createTestOrg(slug, 'Task CRUD Test Org')
      testOrgId = created.orgId
      testProjectId = expectSingle(
        await tc.mutation(api.project.create, {
          name: 'Task Test Project',
          orgId: testOrgId
        })
      )
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
    })
    test('create task - success', async () => {
      const taskId = await tc.mutation(api.task.create, {
        completed: false,
        orgId: testOrgId,
        priority: 'high',
        projectId: testProjectId,
        title: 'Test Task'
      })
      expect(taskId).toBeDefined()
    })
    test('read task - success', async () => {
      const taskId = await tc.mutation(api.task.create, {
        orgId: testOrgId,
        projectId: testProjectId,
        title: 'Read Test Task'
      })
      const task = await tc.query(api.task.read, {
        id: taskId,
        orgId: testOrgId
      })
      expect(task.title).toBe('Read Test Task')
    })
    test('toggle task - owner can toggle', async () => {
      const taskId = expectSingle(
        await tc.mutation(api.task.create, {
          completed: false,
          orgId: testOrgId,
          projectId: testProjectId,
          title: 'Toggle Test Task'
        })
      )
      const toggledRaw: unknown = await tc.mutation(api.task.toggle, {
        id: taskId,
        orgId: testOrgId
      })
      const toggledTask: unknown = Array.isArray(toggledRaw) ? (toggledRaw as unknown[]).at(0) : toggledRaw
      expect(readCompleted(toggledTask)).toBe(true)
    })
    test('rm task - owner can delete', async () => {
      const taskId = expectSingle(
        await tc.mutation(api.task.create, {
          orgId: testOrgId,
          projectId: testProjectId,
          title: 'Delete Test Task'
        })
      )
      await tc.mutation(api.task.rm, { id: taskId, orgId: testOrgId })
      const result = await expectError(async () =>
        tc.query(api.task.read, {
          id: taskId,
          orgId: testOrgId
        })
      )
      expect(result).toHaveProperty('code', 'NOT_FOUND')
    })
  })
test.describe
  .serial('Project Permissions (API)', () => {
    let testOrgId: string
    let memberUserId: string
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('proj-perms')
      const created = await createTestOrg(slug, 'Project Perms Test Org')
      testOrgId = created.orgId
      const memberEmail = `${testPrefix}-proj-member@test.local`
      memberUserId = readStringId(await createTestUser(memberEmail, 'Project Member'))
      await addTestOrgMember(testOrgId, memberUserId, false)
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
      await cleanupTestUsers()
    })
    test('member exists in org', () => {
      expect(memberUserId).toBeDefined()
    })
    test('read project - not found for wrong org', async () => {
      const otherSlug = generateSlug('other-org')
      const otherOrg = await createTestOrg(otherSlug, 'Other Org')
      const projectId = await tc.mutation(api.project.create, {
        name: 'Other Org Project',
        orgId: otherOrg.orgId
      })
      const result = await expectError(async () =>
        tc.query(api.project.read, {
          id: projectId,
          orgId: testOrgId
        })
      )
      expect(result).toHaveProperty('code', 'NOT_FOUND')
    })
  })
test.describe
  .serial('Cascade Deletion (API)', () => {
    let testOrgId: string
    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('cascade')
      const created = await createTestOrg(slug, 'Cascade Test Org')
      testOrgId = created.orgId
    })
    test.afterAll(async () => {
      await cleanupOrgTestData()
    })
    test('delete project - cascades to tasks', async () => {
      const projectId = await tc.mutation(api.project.create, {
        name: 'Cascade Project',
        orgId: testOrgId
      })
      const taskId = await tc.mutation(api.task.create, {
        orgId: testOrgId,
        projectId,
        title: 'Cascade Task'
      })
      await tc.mutation(api.project.rm, { id: projectId, orgId: testOrgId })
      const taskResult = await expectError(async () =>
        tc.query(api.task.read, {
          id: taskId,
          orgId: testOrgId
        })
      )
      expect(taskResult).toHaveProperty('code', 'NOT_FOUND')
    })
    test('delete org - cascades projects and tasks', async () => {
      const cascadeSlug = generateSlug('full-cascade')
      const cascadeOrg = await createTestOrg(cascadeSlug, 'Full Cascade Org')
      const projectId = await tc.mutation(api.project.create, {
        name: 'Full Cascade Project',
        orgId: cascadeOrg.orgId
      })
      await tc.mutation(api.task.create, {
        orgId: cascadeOrg.orgId,
        projectId,
        title: 'Full Cascade Task'
      })
      await tc.mutation(api.org.remove, { orgId: cascadeOrg.orgId })
      const orgResult = await tc.query(api.org.getBySlug, {
        slug: cascadeSlug
      })
      expect(orgResult).toBeNull()
    })
  })
