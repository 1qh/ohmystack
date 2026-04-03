/** biome-ignore-all lint/suspicious/useAwait: promise-function-async conflict */
/** biome-ignore-all lint/performance/useTopLevelRegex: test helper */
/** biome-ignore-all lint/style/noProcessEnv: test helper */
import type { api as BeApi } from '@a/be-convex'
import type { Id } from '@a/be-convex/model'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'
const api = anyApi as unknown as typeof BeApi
const getClient = () => new ConvexHttpClient(process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? '')
const ref = (mod: string, fn: string) => {
  const r = (anyApi as Record<string, Record<string, FunctionReference<'action' | 'mutation' | 'query'>>>)[mod]?.[fn]
  if (!r) throw new Error(`API not found: ${mod}:${fn}`)
  return r
}
const extractErrorCode = (e: unknown): null | { code: string } => {
  if (e instanceof Error) {
    const match = /\{"code":"(?<code>[^"]+)"[^}]*\}/u.exec(e.message)
    if (match?.groups?.code) return { code: match.groups.code }
    if (e.message.includes('ArgumentValidationError') || e.message.includes('does not match validator'))
      return { code: 'VALIDATION_ERROR' }
  }
  return null
}
const expectError = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    const r = extractErrorCode(error)
    if (r) return r as T
    throw error
  }
}
const splitName = (name: string): [string, string] => {
  const parts = name.split(':')
  return [parts[0] ?? '', parts[1] ?? '']
}
const raw = {
  action: async <T>(name: string, args: Record<string, unknown>) => {
    const [mod, fn] = splitName(name)
    return expectError<T>(async () => getClient().action(ref(mod, fn) as FunctionReference<'action'>, args) as Promise<T>)
  },
  mutation: async <T>(name: string, args: Record<string, unknown>) => {
    const [mod, fn] = splitName(name)
    return expectError<T>(
      async () => getClient().mutation(ref(mod, fn) as FunctionReference<'mutation'>, args) as Promise<T>
    )
  },
  query: async <T>(name: string, args: Record<string, unknown>) => {
    const [mod, fn] = splitName(name)
    return expectError<T>(async () => getClient().query(ref(mod, fn) as FunctionReference<'query'>, args) as Promise<T>)
  }
}
const tc = {
  action: async <F extends FunctionReference<'action'>>(f: F, args: FunctionArgs<F>): Promise<FunctionReturnType<F>> =>
    getClient().action(f, args),
  mutation: async <F extends FunctionReference<'mutation'>>(f: F, args: FunctionArgs<F>): Promise<FunctionReturnType<F>> =>
    getClient().mutation(f, args),
  query: async <F extends FunctionReference<'query'>>(f: F, args: FunctionArgs<F>): Promise<FunctionReturnType<F>> =>
    getClient().query(f, args),
  raw
}
const ensureTestUser = async () => {
  await getClient().mutation(ref('testauth', 'ensureTestUser') as FunctionReference<'mutation'>, {})
}
const createTestUser = async (email: string, name: string) =>
  getClient().mutation(ref('testauth', 'createTestUser') as FunctionReference<'mutation'>, { email, name }) as Promise<
    Id<'users'>
  >
const addTestOrgMember = async (orgId: Id<'org'> | string, userId: Id<'users'> | string, isAdmin: boolean) =>
  getClient().mutation(ref('testauth', 'addTestOrgMember') as FunctionReference<'mutation'>, {
    isAdmin,
    orgId,
    userId
  }) as Promise<void>
const removeTestOrgMember = async (orgId: Id<'org'> | string, userId: Id<'users'> | string) =>
  getClient().mutation(ref('testauth', 'removeTestOrgMember') as FunctionReference<'mutation'>, {
    orgId,
    userId
  }) as Promise<void>
const createTestOrg = async (slug: string, name: string) =>
  getClient().mutation(ref('org', 'create') as FunctionReference<'mutation'>, { data: { name, slug } }) as Promise<{
    orgId: string
  }>
const makeOrgTestUtils = (prefix: string) => ({
  cleanupOrgTestData: async () => {
    await getClient().mutation(ref('testauth', 'cleanupOrgTestData') as FunctionReference<'mutation'>, {
      slugPrefix: prefix
    })
  },
  cleanupTestUsers: async () => {
    await getClient().mutation(ref('testauth', 'cleanupTestUsers') as FunctionReference<'mutation'>, {
      emailPrefix: `${prefix}-`
    })
  },
  generateSlug: (suffix: string) => `${prefix}-${suffix}-${Date.now()}`
})
const setupOrg = (testPrefix: string, orgName: string, orgSlugSuffix: string) => {
  const utils = makeOrgTestUtils(testPrefix)
  let orgId = ''
  let orgSlug = ''
  return {
    ...utils,
    afterAll: async () => {
      await utils.cleanupOrgTestData()
      await utils.cleanupTestUsers()
    },
    beforeAll: async () => {
      await ensureTestUser()
      orgSlug = utils.generateSlug(orgSlugSuffix)
      const { orgId: id } = await createTestOrg(orgSlug, orgName)
      orgId = id
      return { orgId, orgSlug }
    },
    get orgId() {
      return orgId
    },
    get orgSlug() {
      return orgSlug
    }
  }
}
export {
  addTestOrgMember,
  api,
  createTestOrg,
  createTestUser,
  ensureTestUser,
  expectError,
  extractErrorCode,
  getClient,
  makeOrgTestUtils,
  removeTestOrgMember,
  setupOrg,
  tc
}
