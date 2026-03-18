'use client'

import type { Org, OrgMember } from '@a/be-spacetimedb/spacetimedb/types'
import type { OrgRole } from '@noboil/spacetimedb'

import { tables } from '@a/be-spacetimedb/spacetimedb'
import { sameIdentity } from '@a/fe/utils'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'

import { OrgRedirect } from './layout'
import OrgList from './org-list'

interface MyOrgsItem {
  org: { _id: string; avatarId?: string; name: string; slug: string }
  role: OrgRole
}

const Page = () => {
  const router = useRouter(),
    { identity } = useSpacetimeDB(),
    [orgs] = useTable(tables.org),
    [members] = useTable(tables.orgMember)

  useEffect(() => {
    if (!identity) router.replace('/login')
  }, [identity, router])

  const myMemberships = identity
      ? members.filter((m: OrgMember) => m.userId.toHexString() === identity.toHexString())
      : [],
    myOrgs = myMemberships
      .map((m: OrgMember) => {
        if (!identity) return null
        const org = orgs.find((o: Org) => o.id === m.orgId)
        if (!org) return null
        const role: OrgRole = sameIdentity(org.userId, identity) ? 'owner' : m.isAdmin ? 'admin' : 'member'
        return { org: { _id: `${org.id}`, avatarId: org.avatarId, name: org.name, slug: org.slug }, role }
      })
      .filter(item => item !== null)

  useEffect(() => {
    if (myOrgs.length === 0) router.replace('/onboarding')
  }, [myOrgs.length, router])

  if (!identity) return null

  if (myOrgs.length === 0) return null

  if (myOrgs.length === 1) {
    const [first] = myOrgs
    if (first) return <OrgRedirect orgId={first.org._id} slug={first.org.slug} to='/dashboard' />
  }

  return (
    <div className='container py-8'>
      <h1 className='mb-6 text-2xl font-bold'>Your Organizations</h1>
      <OrgList
        // oxlint-disable-next-line react-perf/jsx-no-new-array-as-prop
        orgs={myOrgs.map((o: MyOrgsItem) => ({
          avatarId: o.org.avatarId,
          id: o.org._id,
          name: o.org.name,
          role: o.role,
          slug: o.org.slug
        }))}
      />
    </div>
  )
}

export default Page
