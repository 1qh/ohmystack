/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
'use client'

import type { FunctionReference } from 'convex/server'
import type { ReactNode } from 'react'

import { useMutation, useQuery } from 'convex/react'
import { createContext, use, useCallback, useMemo, useState } from 'react'

import type { OrgRole } from '../server/types'

import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_SLUG_COOKIE, ONE_YEAR_SECONDS } from '../constants'

type InferOrg<F> = F extends { _returnType: infer R } ? (NonNullable<R> extends OrgDoc ? NonNullable<R> : OrgDoc) : OrgDoc

interface OrgDoc {
  [key: string]: unknown
  _id: string
  slug: string
}

const OrgContext = createContext<null | OrgContextValue>(null)

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
  useOrgQuery = <F extends FunctionReference<'query'>>(
    query: F,
    args?: 'skip' | Omit<F['_args'], 'orgId'>
  ): F['_returnType'] | undefined => {
    const { orgId } = useOrg()
    return useQuery(query as FunctionReference<'query'>, args === 'skip' ? 'skip' : { ...args, orgId })
  },
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
