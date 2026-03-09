/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
'use client'

import type { FunctionReference } from 'convex/server'
import type { ReactNode } from 'react'

import { useMutation, useQuery } from 'convex/react'
import { createContext, use, useCallback, useMemo, useState } from 'react'

import type { OrgRole } from '../server/types'

import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_SLUG_COOKIE, ONE_YEAR_SECONDS } from '../constants'

type InferOrg<F> = F extends { _returnType: infer R } ? (NonNullable<R> extends OrgDoc ? NonNullable<R> : OrgDoc) : OrgDoc

/** Context value exposing the current org, membership, role, and permission flags. */
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
  role: OrgRole
}

/** Base shape for an org document, requiring _id and slug. */
interface OrgDoc {
  [key: string]: unknown
  _id: string
  slug: string
}

const OrgContext = createContext<null | OrgContextValue>(null)

/** Props for the OrgProvider component. */
interface OrgProviderProps<O extends OrgDoc, M> {
  children: ReactNode
  membership: M | null
  org: O
  role: OrgRole
}

/** Provides org context (role, permissions, membership) to the component tree. */
const OrgProvider = <O extends OrgDoc, M>({ children, membership, org, role }: OrgProviderProps<O, M>) => {
    const value = useMemo<OrgContextValue<O, M>>(() => {
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
        role
      }
    }, [membership, org, role])

    return <OrgContext value={value as OrgContextValue}>{children}</OrgContext>
  },
  /** Returns the current org context; throws if used outside OrgProvider. */
  useOrg = <O extends OrgDoc = OrgDoc, M = unknown>() => {
    const ctx = use(OrgContext)
    if (!ctx) throw new Error('useOrg must be used inside OrgProvider')
    return ctx as OrgContextValue<O, M>
  },
  /**
   * Wraps useQuery to automatically inject the current org's ID.
   * @param query A Convex query reference that accepts an orgId argument
   * @example
   * ```tsx
   * const wikis = useOrgQuery(api.wiki.list)
   * ```
   */
  useOrgQuery = <F extends FunctionReference<'query'>>(
    query: F,
    args?: 'skip' | Omit<F['_args'], 'orgId'>
  ): F['_returnType'] | undefined => {
    const { orgId } = useOrg()
    return useQuery(query as FunctionReference<'query'>, args === 'skip' ? 'skip' : { ...args, orgId })
  },
  /** Wraps useMutation to automatically inject the current org's ID. */
  useOrgMutation = <F extends FunctionReference<'mutation'>>(mutation: F) => {
    const { orgId } = useOrg(),
      mutate = useMutation(mutation as FunctionReference<'mutation'>)
    return useCallback(
      async (args?: Omit<F['_args'], 'orgId'>): Promise<F['_returnType']> => mutate({ ...args, orgId }),
      [mutate, orgId]
    )
  },
  /** Returns whether the user can edit a resource based on admin status, ownership, or editor list. */
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
  }): boolean => isAdmin || resource.userId === userId || editorsList.some(e => e.userId === userId),
  /** Fetches the current user's org memberships via the given query reference. */
  useMyOrgs = <O extends OrgDoc>(myOrgsQuery: FunctionReference<'query'>) => {
    const data = useQuery(myOrgsQuery) as undefined | { org: O; role: OrgRole }[]
    return { isLoading: data === undefined, orgs: (data ?? []) as { org: O; role: OrgRole }[] }
  },
  COOKIE_PREFIX = `${ACTIVE_ORG_COOKIE}=`,
  getActiveOrgIdFromCookie = (): null | string => {
    if (typeof document === 'undefined') return null
    for (const c of document.cookie.split('; ')) if (c.startsWith(COOKIE_PREFIX)) return c.slice(COOKIE_PREFIX.length)
    return null
  },
  /** Sets the active org ID and slug as client-side cookies. */
  setActiveOrgCookieClient = ({ orgId, slug }: { orgId: string; slug: string }) => {
    const maxAge = ONE_YEAR_SECONDS
    /* oxlint-disable unicorn/no-document-cookie */
    // biome-ignore lint/suspicious/noDocumentCookie: cookie management
    document.cookie = `${ACTIVE_ORG_COOKIE}=${orgId}; path=/; max-age=${maxAge}`
    // biome-ignore lint/suspicious/noDocumentCookie: cookie management
    document.cookie = `${ACTIVE_ORG_SLUG_COOKIE}=${slug}; path=/; max-age=${maxAge}`
    /* oxlint-enable unicorn/no-document-cookie */
  },
  useActiveOrg = <O extends OrgDoc>(orgGetQuery: FunctionReference<'query'>) => {
    const [activeOrgId, setActiveOrgId] = useState<null | string>(getActiveOrgIdFromCookie),
      activeOrg = useQuery(orgGetQuery, activeOrgId ? { orgId: activeOrgId } : 'skip') as null | O | undefined,
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      setActiveOrg = useCallback((org: OrgDoc) => {
        setActiveOrgCookieClient({ orgId: org._id, slug: org.slug })
        setActiveOrgId(org._id)
      }, []),
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      clearActiveOrg = useCallback(() => {
        /* oxlint-disable unicorn/no-document-cookie */
        // biome-ignore lint/suspicious/noDocumentCookie: cookie management
        document.cookie = `${ACTIVE_ORG_COOKIE}=; path=/; max-age=0`
        // biome-ignore lint/suspicious/noDocumentCookie: cookie management
        document.cookie = `${ACTIVE_ORG_SLUG_COOKIE}=; path=/; max-age=0`
        /* oxlint-enable unicorn/no-document-cookie */
        setActiveOrgId(null)
      }, [])

    return {
      activeOrg: activeOrg ?? null,
      activeOrgId,
      clearActiveOrg,
      isLoading: activeOrgId ? activeOrg === undefined : false,
      setActiveOrg
    }
  },
  /** Creates pre-bound org hooks (useActiveOrg, useMyOrgs, useOrg) from an org API object. */
  createOrgHooks = <F extends FunctionReference<'query'>, O extends OrgDoc = InferOrg<F>, M = unknown>(orgApi: {
    get: F
    myOrgs: FunctionReference<'query'>
  }) => ({
    useActiveOrg: () => useActiveOrg<O>(orgApi.get),
    useMyOrgs: () => useMyOrgs<O>(orgApi.myOrgs),
    useOrg: () => useOrg<O, M>()
  })

export type { OrgContextValue, OrgDoc, OrgProviderProps }
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
