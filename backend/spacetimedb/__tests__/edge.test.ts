import { callReducer, extractErrorData, getErrorCode } from '@noboil/spacetimedb/test'
import { describe, expect, test } from 'bun:test'

import type { ErrorContext, EventContext, ReducerEventContext, SubscriptionEventContext } from '../module_bindings'

import { reducers, tables } from '../module_bindings'
import { findMine, getNumber, getString, listTable, none, some, withCtx } from './test-helpers'

describe('binding edges', () => {
  test('binding context types are exported', () => {
    const eventContextType: EventContext | null = null,
      reducerContextType: null | ReducerEventContext = null,
      subscriptionContextType: null | SubscriptionEventContext = null,
      errorContextType: ErrorContext | null = null

    expect(eventContextType).toBeNull()
    expect(reducerContextType).toBeNull()
    expect(subscriptionContextType).toBeNull()
    expect(errorContextType).toBeNull()
  })

  test('movie reducers are exposed in generated accessors', () => {
    expect(typeof reducers.createMovie).toBe('object')
    expect(typeof reducers.updateMovie).toBe('object')
    expect(typeof reducers.rmMovie).toBe('object')
    expect(typeof reducers.invalidateMovie).toBe('object')
    expect(typeof reducers.purgeMovie).toBe('object')
    expect(tables.movie).toBeDefined()
  })

  test('profile reducers are exposed in generated accessors', () => {
    expect(typeof reducers.getBlogProfile).toBe('object')
    expect(typeof reducers.upsertBlogProfile).toBe('object')
    expect(typeof reducers.getOrgProfile).toBe('object')
    expect(typeof reducers.upsertOrgProfile).toBe('object')
    expect(tables.blogProfile).toBeDefined()
    expect(tables.orgProfile).toBeDefined()
  })
})

describe('runtime edges', () => {
  test('movie create and rm reducers mutate movie rows', async () => {
    await withCtx(async ctx => {
      const [user] = ctx.users

      if (!user) throw new Error('Missing test user')
      const tmdbId = Date.now() % 4_000_000_000
      await callReducer(ctx, 'create_movie', {
        backdropPath: none,
        budget: none,
        genres: [{ id: 1, name: 'Action' }],
        originalTitle: `Original-${tmdbId.toString()}`,
        overview: 'overview',
        posterPath: none,
        releaseDate: '2026-01-01',
        revenue: none,
        runtime: none,
        tagline: none,
        title: `Movie-${tmdbId.toString()}`,
        tmdbId,
        voteAverage: 7.1,
        voteCount: 10
      })

      const rows = await listTable(ctx, 'movie', user),
        found = rows.find(row => getNumber(row, 'tmdb_id') === tmdbId)
      expect(found).toBeDefined()
      expect(getString(found as Record<string, unknown>, 'title')).toBe(`Movie-${tmdbId.toString()}`)

      await callReducer(ctx, 'rm_movie', { tmdbId })
      const afterRm = await listTable(ctx, 'movie', user),
        stillExists = afterRm.some(row => getNumber(row, 'tmdb_id') === tmdbId)
      expect(stillExists).toBe(false)
    })
  })

  test('profile upsert creates row tied to caller identity', async () => {
    await withCtx(async ctx => {
      const [user] = ctx.users

      if (!user) throw new Error('Missing test user')
      const displayName = `Profile-${Date.now().toString()}`
      await callReducer(ctx, 'upsert_blogProfile', {
        avatar: none,
        bio: some(some(`Bio-${displayName}`)),
        displayName: some(displayName),
        notifications: some(true),
        theme: some('system')
      })

      const rows = await listTable(ctx, 'blog_profile', user),
        mine = findMine(rows, user.identity),
        found = mine.find(row => getString(row, 'display_name') === displayName)

      expect(found).toBeDefined()
    })
  })

  test('reducer failures keep REDUCER_CALL_FAILED prefix and parse as unknown server error', () => {
    const error = new Error('REDUCER_CALL_FAILED: The instance encountered a fatal error.'),
      parsed = extractErrorData(error),
      code = getErrorCode(error)

    expect(parsed).toBeUndefined()
    expect(code).toBeUndefined()
    expect(error.message.startsWith('REDUCER_CALL_FAILED')).toBe(true)
  })
})
