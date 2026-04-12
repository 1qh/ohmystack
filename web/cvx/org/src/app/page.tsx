import type { OrgRole } from '@noboil/convex'
import { api } from '@a/be-convex'
import { getToken, isAuthenticated } from '@noboil/convex/next'
import { fetchQuery } from 'convex/nextjs'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getTestClient } from '~/utils'
import OrgList from './org-list'
import OrgRedirect from './org-redirect'
interface MyOrgsItem {
  org: { _id: string; avatarId?: string; name: string; slug: string }
  role: OrgRole
}
const Page = async () => {
  await connection()
  if (!(await isAuthenticated())) redirect('/login')
  const token = await getToken()
  let orgs: MyOrgsItem[]
  if (token) orgs = (await fetchQuery(api.org.myOrgs, {}, { token })) as MyOrgsItem[]
  else {
    const tc = getTestClient()
    orgs = (await tc.query(api.org.myOrgs, {})) as MyOrgsItem[]
  }
  if (orgs.length === 0) redirect('/onboarding')
  if (orgs.length === 1) {
    const [first] = orgs
    if (first) return <OrgRedirect orgId={first.org._id} slug={first.org.slug} to='/dashboard' />
  }
  // oxlint-disable-next-line jsx-no-new-array-as-prop
  const orgList = orgs.map((o: MyOrgsItem) => ({
    avatarId: o.org.avatarId,
    id: o.org._id,
    name: o.org.name,
    role: o.role,
    slug: o.org.slug
  }))
  return (
    <div className='container py-8'>
      <h1 className='mb-6 text-2xl font-bold'>Your Organizations</h1>
      <OrgList orgs={orgList} />
    </div>
  )
}
export default Page
