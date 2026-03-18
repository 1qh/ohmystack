import { callReducer } from '@noboil/spacetimedb/test'
import { describe, expect, test } from 'bun:test'

import { reducers, tables } from '../module_bindings'
import orgInviteTable from '../module_bindings/org_invite_table'
import orgJoinRequestTable from '../module_bindings/org_join_request_table'
import orgMemberTable from '../module_bindings/org_member_table'
import orgTable from '../module_bindings/org_table'
import { none, withCtx } from './test-helpers'

describe('org api port', () => {
  test('org data tables remain available in bindings', () => {
    expect(tables.org).toBeDefined()
    expect(tables.orgMember).toBeDefined()
    expect(tables.orgInvite).toBeDefined()
    expect(tables.orgJoinRequest).toBeDefined()
    expect(orgTable).toBeDefined()
    expect(orgMemberTable).toBeDefined()
    expect(orgInviteTable).toBeDefined()
    expect(orgJoinRequestTable).toBeDefined()
  })

  test('org management reducers are not exported by current module', () => {
    // eslint-disable-next-line noboil-stdb/no-unsafe-api-cast
    expect((reducers as Record<string, unknown>).createOrg).toBeUndefined()
    // eslint-disable-next-line noboil-stdb/no-unsafe-api-cast
    expect((reducers as Record<string, unknown>).updateOrg).toBeUndefined()
    // eslint-disable-next-line noboil-stdb/no-unsafe-api-cast
    expect((reducers as Record<string, unknown>).getOrg).toBeUndefined()
    // eslint-disable-next-line noboil-stdb/no-unsafe-api-cast
    expect((reducers as Record<string, unknown>).inviteOrg).toBeUndefined()
  })

  test('org-scoped CRUD reducers exist for project task and wiki', () => {
    expect(typeof reducers.createProject).toBe('object')
    expect(typeof reducers.updateProject).toBe('object')
    expect(typeof reducers.rmProject).toBe('object')
    expect(typeof reducers.createTask).toBe('object')
    expect(typeof reducers.updateTask).toBe('object')
    expect(typeof reducers.rmTask).toBe('object')
    expect(typeof reducers.createWiki).toBe('object')
    expect(typeof reducers.updateWiki).toBe('object')
    expect(typeof reducers.rmWiki).toBe('object')
  })

  test('project reducer call fails without org bootstrap reducers', async () => {
    await withCtx(async ctx => {
      let threw = false
      try {
        await callReducer(ctx, 'create_project', {
          description: none,
          editors: none,
          name: `project-${Date.now().toString()}`,
          orgId: 1,
          status: none
        })
      } catch (error) {
        threw = true
        expect(String(error)).toContain('REDUCER_CALL_FAILED')
      }
      expect(threw).toBe(true)
    })
  })

  test('wiki reducer call fails without org bootstrap reducers', async () => {
    await withCtx(async ctx => {
      let threw = false
      try {
        await callReducer(ctx, 'create_wiki', {
          content: none,
          deletedAt: none,
          editors: none,
          orgId: 1,
          slug: `wiki-${Date.now().toString()}`,
          status: 'draft',
          title: 'wiki title'
        })
      } catch (error) {
        threw = true
        expect(String(error)).toContain('REDUCER_CALL_FAILED')
      }
      expect(threw).toBe(true)
    })
  })
})
