'use client'
import type { OrgListGridItem } from '@a/fe/org-list-grid'
import type { OrgRole } from '@noboil/convex'
import OrgListGrid from '@a/fe/org-list-grid'
import { OrgAvatar, RoleBadge } from '@noboil/convex/components'
import { setActiveOrgCookieClient } from '@noboil/convex/react'
import { useRouter } from 'next/navigation'
type OrgItem = OrgListGridItem<OrgRole>
const OrgList = ({ orgs }: { orgs: OrgItem[] }) => {
  const router = useRouter(),
    onSelect = (o: OrgItem) => {
      setActiveOrgCookieClient({ orgId: o.id, slug: o.slug })
      router.push('/dashboard')
    }
  return (
    <OrgListGrid
      onSelect={onSelect}
      orgs={orgs}
      renderAvatar={o => (
        <OrgAvatar name={o.name} size='lg' src={o.avatarId ? `/api/image?id=${o.avatarId}` : undefined} />
      )}
      renderRole={role => <RoleBadge role={role} />}
    />
  )
}
export default OrgList
