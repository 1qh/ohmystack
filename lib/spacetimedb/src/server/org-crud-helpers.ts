import type { Identity } from 'spacetimedb'

import type { OrgCrudMemberLike } from './types/org-crud'

import { checkMembership } from './org-crud'
import { identityEquals, makeError } from './reducer-utils'
const requireOrgMember = <OrgId, Member extends OrgCrudMemberLike<OrgId>>({
    operation,
    orgId,
    orgMemberTable,
    sender,
    tableName
  }: {
    operation: string
    orgId: OrgId
    orgMemberTable: Iterable<Member>
    sender: Identity
    tableName: string
  }): Member => {
    const member = checkMembership(orgMemberTable, orgId, sender)
    if (!member) throw makeError('NOT_ORG_MEMBER', `${tableName}:${operation}`)
    return member
  },
  canEdit = ({
    member,
    row,
    sender
  }: {
    member: { isAdmin: boolean }
    row: { userId: Identity }
    sender: Identity
  }): boolean => member.isAdmin || identityEquals(row.userId, sender)
export { canEdit, requireOrgMember }
