'use client'
/* oxlint-disable no-underscore-dangle -- Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
import MembersPageShell from '@a/fe/members-page-shell'
import { useOrg } from '~/hook/use-org'
import InviteDialog from './invite-dialog'
import JoinRequests from './join-requests'
import MemberList from './member-list'
import PendingInvites from './pending-invites'
const MembersPage = () => {
  const { canManageMembers, org } = useOrg()
  return (
    <MembersPageShell
      canManageMembers={canManageMembers}
      InviteDialog={InviteDialog}
      JoinRequests={JoinRequests}
      MemberList={MemberList}
      orgId={org._id}
      PendingInvites={PendingInvites}
    />
  )
}
export default MembersPage
