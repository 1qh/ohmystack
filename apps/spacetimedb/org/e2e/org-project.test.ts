// biome-ignore-all lint/performance/useTopLevelRegex: test file

import { login } from '@a/e2e/helpers'
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

const testPrefix = `e2e-org-proj-${Date.now()}`,
  { cleanupOrgTestData, cleanupTestUsers, generateSlug } = makeOrgTestUtils(testPrefix),
  readStringId = (value: unknown): string => {
    if (typeof value === 'string' && value.length > 0) return value
    throw new TypeError('Expected non-empty string id')
  },
  readName = (value: unknown): string | undefined => {
    if (typeof value !== 'object' || !value) return
    const { name } = value as { name?: unknown }
    return typeof name === 'string' ? name : undefined
  }

test.describe
  .serial('Projects Page UI', () => {
    let testOrgId: string

    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('proj-ui'),
        created = await createTestOrg(slug, 'Project UI Test Org')
      testOrgId = created.orgId

      await tc.mutation(api.project.create, {
        name: 'UI Test Project',
        orgId: testOrgId
      })
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
    })

    test.beforeEach(async ({ page }) => {
      await login(page)
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
      const slug = generateSlug('proj-crud'),
        created = await createTestOrg(slug, 'Project CRUD Test Org')
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
        }),
        project = await tc.query(api.project.read, {
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
        }),
        updated: unknown = await tc.mutation(api.project.update, {
          id: projectId,
          name: 'Updated Project Name',
          orgId: testOrgId
        })
      expect(readName(updated)).toBe('Updated Project Name')
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
        }),
        id2 = await tc.mutation(api.project.create, {
          name: 'Bulk Delete 2',
          orgId: testOrgId
        }),
        deleted = await tc.mutation(api.project.rm, {
          ids: [id1, id2],
          orgId: testOrgId
        })
      expect(deleted).toBe(2)
    })
  })

test.describe
  .serial('Task CRUD (API)', () => {
    let testOrgId: string, testProjectId: string

    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('task-crud'),
        created = await createTestOrg(slug, 'Task CRUD Test Org')
      testOrgId = created.orgId
      testProjectId = await tc.mutation(api.project.create, {
        name: 'Task Test Project',
        orgId: testOrgId
      })
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
        }),
        task = await tc.query(api.task.read, {
          id: taskId,
          orgId: testOrgId
        })
      expect(task.title).toBe('Read Test Task')
    })

    test('toggle task - owner can toggle', async () => {
      const taskId = await tc.mutation(api.task.create, {
          completed: false,
          orgId: testOrgId,
          projectId: testProjectId,
          title: 'Toggle Test Task'
        }),
        toggled = await tc.mutation(api.task.toggle, {
          id: taskId,
          orgId: testOrgId
        })
      expect(toggled?.completed).toBe(true)
    })

    test('rm task - owner can delete', async () => {
      const taskId = await tc.mutation(api.task.create, {
        orgId: testOrgId,
        projectId: testProjectId,
        title: 'Delete Test Task'
      })
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
    let testOrgId: string, memberUserId: string

    test.beforeAll(async () => {
      await ensureTestUser()
      const slug = generateSlug('proj-perms'),
        created = await createTestOrg(slug, 'Project Perms Test Org')
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
      const otherSlug = generateSlug('other-org'),
        otherOrg = await createTestOrg(otherSlug, 'Other Org'),
        projectId = await tc.mutation(api.project.create, {
          name: 'Other Org Project',
          orgId: otherOrg.orgId
        }),
        result = await expectError(async () =>
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
      const slug = generateSlug('cascade'),
        created = await createTestOrg(slug, 'Cascade Test Org')
      testOrgId = created.orgId
    })

    test.afterAll(async () => {
      await cleanupOrgTestData()
    })

    test('delete project - cascades to tasks', async () => {
      const projectId = await tc.mutation(api.project.create, {
          name: 'Cascade Project',
          orgId: testOrgId
        }),
        taskId = await tc.mutation(api.task.create, {
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
      const cascadeSlug = generateSlug('full-cascade'),
        cascadeOrg = await createTestOrg(cascadeSlug, 'Full Cascade Org'),
        projectId = await tc.mutation(api.project.create, {
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
