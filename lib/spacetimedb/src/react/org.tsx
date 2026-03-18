/** biome-ignore-all lint/suspicious/noDocumentCookie: org cookie management */
// oxlint-disable no-document-cookie
'use client'

import type { ReactNode } from 'react'

import { createContext, use, useCallback, useMemo, useState } from 'react'

import type { OrgRole } from '../server/types'

import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_SLUG_COOKIE, ONE_YEAR_SECONDS } from '../constants'

/** Active organization selection state exposed by `useActiveOrg`. */
interface ActiveOrgState<O extends OrgDoc = OrgDoc> {
  activeOrg: null | O
  activeOrgId: null | string
  clearActiveOrg: () => void
  isLoading: boolean
  setActiveOrg: (org: O) => void
}

/** Organization context payload exposed by `useOrg`. */
interface OrgContextValue<O extends OrgDoc = OrgDoc, M = unknown> {
  canDeleteOrg: boolean
  canManageAdmins: boolean
  canManageMembers: boolean
  isAdmin: boolean
  isMember: boolean
  isOwner: boolean
  membership: M | null
  org: O
  orgId: string
  orgs: OrgMembership<O>[]
  role: OrgRole
}

/** Minimal org document contract used by Betterspace org hooks. */
interface OrgDoc {
  [key: string]: unknown
  _id: string
  slug: string
}

/** Membership entry pairing an org document with role information. */
interface OrgMembership<O extends OrgDoc = OrgDoc> {
  org: O
  role: OrgRole
}

/** Props accepted by `OrgProvider`. */
interface OrgProviderProps<O extends OrgDoc, M> {
  children: ReactNode
  membership: M | null
  org: O
  orgs?: OrgMembership<O>[]
  role: OrgRole
}

const EMPTY_ORGS: OrgMembership[] = [],
  OrgContext = createContext<null | OrgContextValue>(null),
  ActiveOrgContext = createContext<ActiveOrgState | null>(null),
  COOKIE_PREFIX = `${ACTIVE_ORG_COOKIE}=`,
  getActiveOrgIdFromCookie = (): null | string => {
    if (typeof document === 'undefined') return null
    for (const c of document.cookie.split('; ')) if (c.startsWith(COOKIE_PREFIX)) return c.slice(COOKIE_PREFIX.length)
    return null
  },
  /**
   * Persists active organization identifiers in client cookies.
   * @param options Org id and slug to store.
   * @returns Nothing.
   */
  setActiveOrgCookieClient = ({ orgId, slug }: { orgId: string; slug: string }) => {
    if (typeof document === 'undefined') return
    const maxAge = ONE_YEAR_SECONDS
    document.cookie = `${ACTIVE_ORG_COOKIE}=${orgId}; path=/; max-age=${maxAge}`
    document.cookie = `${ACTIVE_ORG_SLUG_COOKIE}=${slug}; path=/; max-age=${maxAge}`
  },
  clearActiveOrgCookieClient = () => {
    if (typeof document === 'undefined') return
    document.cookie = `${ACTIVE_ORG_COOKIE}=; path=/; max-age=0`
    document.cookie = `${ACTIVE_ORG_SLUG_COOKIE}=; path=/; max-age=0`
  },
  useResolveActiveOrg = <O extends OrgDoc>(orgs: OrgMembership<O>[], currentOrg: O): ActiveOrgState<O> => {
    const [activeOrgId, setActiveOrgId] = useState<null | string>(getActiveOrgIdFromCookie),
      activeOrg = useMemo(() => {
        if (activeOrgId) for (const m of orgs) if (m.org._id === activeOrgId) return m.org

        return currentOrg
      }, [activeOrgId, currentOrg, orgs]),
      setActiveOrg = useCallback((org: O) => {
        setActiveOrgCookieClient({ orgId: org._id, slug: org.slug })
        setActiveOrgId(org._id)
      }, []),
      clearActiveOrg = useCallback(() => {
        clearActiveOrgCookieClient()
        setActiveOrgId(null)
      }, [])
    return { activeOrg, activeOrgId, clearActiveOrg, isLoading: false, setActiveOrg }
  },
  /**
   * Provides organization role state and active-org switching helpers.
   * @param props Provider props including current org, role, and children.
   * @returns Context providers for org and active-org state.
   */
  OrgProvider = <O extends OrgDoc, M>({
    children,
    membership,
    org,
    orgs = EMPTY_ORGS as OrgMembership<O>[],
    role
  }: OrgProviderProps<O, M>) => {
    const activeState = useResolveActiveOrg(orgs, org),
      value = useMemo<OrgContextValue<O, M>>(() => {
        const isOwner = role === 'owner',
          isAdmin = role === 'owner' || role === 'admin'
        return {
          canDeleteOrg: isOwner,
          canManageAdmins: isOwner,
          canManageMembers: isAdmin,
          isAdmin,
          isMember: true,
          isOwner,
          membership,
          org,
          orgId: org._id,
          orgs,
          role
        }
      }, [membership, org, orgs, role])
    return (
      <ActiveOrgContext value={activeState as unknown as ActiveOrgState}>
        <OrgContext value={value as OrgContextValue}>{children}</OrgContext>
      </ActiveOrgContext>
    )
  },
  /**
   * Reads the organization context and throws outside `OrgProvider`.
   * @returns The typed org context value.
   */
  useOrg = <O extends OrgDoc = OrgDoc, M = unknown>() => {
    const ctx = use(OrgContext)
    if (!ctx)
      throw new Error(
        '[@noboil/spacetimedb] useOrg must be used inside OrgProvider. Wrap your component tree with <OrgProvider> from createOrgHooks(), or check that the component calling useOrg is a descendant of OrgProvider.'
      )
    return ctx as OrgContextValue<O, M>
  },
  /**
   * Reads active-org selection helpers and state.
   * @returns The typed active-org state.
   */
  useActiveOrg = <O extends OrgDoc = OrgDoc>() => {
    const ctx = use(ActiveOrgContext)
    if (!ctx)
      throw new Error(
        '[@noboil/spacetimedb] useActiveOrg must be used inside OrgProvider. Wrap your component tree with <OrgProvider> from createOrgHooks(), or check that the component calling useActiveOrg is a descendant of OrgProvider.'
      )
    return ctx as unknown as ActiveOrgState<O>
  },
  /**
   * Returns all org memberships for the current user context.
   * @returns Membership list with loading metadata.
   */
  useMyOrgs = <O extends OrgDoc = OrgDoc>() => {
    const ctx = use(OrgContext)
    if (!ctx) return { isLoading: false, orgs: [] as OrgMembership<O>[] }
    return { isLoading: false, orgs: ctx.orgs as OrgMembership<O>[] }
  },
  /**
   * Injects the active org id into query args unless explicitly skipped.
   * @param query Query hook or function to invoke.
   * @param args Query arguments or `'skip'`.
   * @returns Query result when executed, otherwise `undefined`.
   */
  useOrgQuery = (
    query: ((queryArgs: Record<string, unknown>) => unknown) | undefined,
    args?: 'skip' | Record<string, unknown>
  ): unknown => {
    const { orgId } = useOrg()
    if (!(query && args !== 'skip')) return
    return query({ ...args, orgId })
  },
  /**
   * Wraps a mutation and automatically injects `orgId` into args.
   * @param mutation Mutation function that accepts args with org id.
   * @returns Callback that merges caller args with current org id.
   */
  useOrgMutation = <A extends Record<string, unknown>>(mutation: (args: A) => Promise<unknown>) => {
    const { orgId } = useOrg()
    return useCallback(
      async (mutationArgs?: Omit<A, 'orgId'>): Promise<unknown> => mutation({ ...mutationArgs, orgId } as unknown as A),
      [mutation, orgId]
    )
  },
  /**
   * Checks if a user can edit an org-owned resource.
   * @param options Resource owner, editor list, and user role context.
   * @returns `true` when the user can edit the resource.
   */
  canEditResource = ({
    editorsList,
    isAdmin,
    resource,
    userId
  }: {
    editorsList: { userId: string }[]
    isAdmin: boolean
    resource: { userId: string }
    userId: string
  }): boolean => {
    if (isAdmin || resource.userId === userId) return true
    for (const editor of editorsList) if (editor.userId === userId) return true
    return false
  },
  /**
   * Creates pre-typed org hooks for app-specific org and membership shapes.
   * @returns Typed wrappers around org context hooks.
   */
  createOrgHooks = <O extends OrgDoc = OrgDoc, M = unknown>(config?: { orgIdForMutation?: (id: string) => unknown }) => ({
    useActiveOrg: () => useActiveOrg<O>(),
    useMyOrgs: () => useMyOrgs<O>(),
    useOrg: () => useOrg<O, M>(),
    useOrgMutation: <A extends Record<string, unknown>>(mutation: (args: A) => Promise<unknown>) => {
      const { orgId } = useOrg<O, M>(),
        resolved = config?.orgIdForMutation ? config.orgIdForMutation(orgId) : orgId
      return useCallback(
        async (mutationArgs?: Omit<A, 'orgId'>): Promise<unknown> =>
          mutation({ ...mutationArgs, orgId: resolved } as unknown as A),
        [mutation, resolved]
      )
    }
  })

export type { ActiveOrgState, OrgContextValue, OrgDoc, OrgMembership, OrgProviderProps }
export {
  canEditResource,
  createOrgHooks,
  OrgProvider,
  setActiveOrgCookieClient,
  useActiveOrg,
  useMyOrgs,
  useOrg,
  useOrgMutation,
  useOrgQuery
}
