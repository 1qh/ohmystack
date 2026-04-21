'use client'
import type { OrgListGridItem } from '@a/fe/org-list-grid'
import type { OrgRole } from 'noboil/spacetimedb'
import OrgListGrid from '@a/fe/org-list-grid'
import { useRouter } from 'next/navigation'
import { OrgAvatar, RoleBadge } from 'noboil/spacetimedb/components'
import { resolveFileUrl, setActiveOrgCookieClient, useFiles } from 'noboil/spacetimedb/react'
type OrgItem = OrgListGridItem<OrgRole>
const OrgList = ({ orgs }: { orgs: OrgItem[] }) => {
  const router = useRouter()
  const files = useFiles()
  const onSelect = (o: OrgItem) => {
    setActiveOrgCookieClient({ orgId: o.id, slug: o.slug })
    router.push('/dashboard')
  }
  return (
    <OrgListGrid
      onSelect={onSelect}
      orgs={orgs}
      renderAvatar={o => (
        <OrgAvatar
          name={o.name}
          size='lg'
          src={o.avatarId ? (resolveFileUrl(files, o.avatarId) ?? undefined) : undefined}
        />
      )}
      renderRole={role => <RoleBadge role={role} />}
    />
  )
}
export default OrgList
