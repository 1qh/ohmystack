type RlsCategory = 'base' | 'children' | 'file' | 'org' | 'orgScoped' | 'owned' | 'singleton'
type RlsPub = boolean | string | undefined
const RLS_COL = { orgId: 'orgId', userId: 'userId' } as const,
  RLS_TBL = { orgMember: 'orgMember' } as const,
  q = (tbl: string, col: string): string => `"${tbl}"."${col}"`,
  rlsSelect = (tbl: string): string => `SELECT * FROM "${tbl}"`,
  rlsSelectJoin = (tbl: string, joinTbl: string, onCol: string): string =>
    `SELECT "${tbl}".* FROM "${tbl}" JOIN "${joinTbl}" ON ${q(tbl, onCol)} = ${q(joinTbl, onCol)}`,
  rlsWhereSender = (tbl: string, col: string): string => `${rlsSelect(tbl)} WHERE ${q(tbl, col)} = :sender`,
  rlsWherePubOrSender = (tbl: string, pubCol: string, senderCol: string): string =>
    `${rlsSelect(tbl)} WHERE ${q(tbl, pubCol)} = true OR ${q(tbl, senderCol)} = :sender`,
  rlsJoinWhereSender = (tbl: string, joinTbl: string, onCol: string): string =>
    `${rlsSelectJoin(tbl, joinTbl, onCol)} WHERE ${q(joinTbl, RLS_COL.userId)} = :sender`,
  rlsWherePub = (tbl: string, pubCol: string): string => `${rlsSelect(tbl)} WHERE ${q(tbl, pubCol)} = true`,
  rlsChildJoinPubOrSender = ({
    child,
    fk,
    parent,
    pubCol
  }: {
    child: string
    fk: string
    parent: string
    pubCol: string
  }): string =>
    `SELECT "${child}".* FROM "${child}" JOIN "${parent}" ON ${q(child, fk)} = ${q(parent, 'id')} WHERE ${q(parent, pubCol)} = true OR ${q(child, RLS_COL.userId)} = :sender`,
  rlsChildSql = ({
    fk,
    name,
    parent,
    parentPub
  }: {
    fk: string
    name: string
    parent: string
    parentPub?: RlsPub
  }): string[] => {
    if (parentPub === true) return []
    if (typeof parentPub === 'string') return [rlsChildJoinPubOrSender({ child: name, fk, parent, pubCol: parentPub })]
    return [rlsWhereSender(name, RLS_COL.userId)]
  },
  rlsSql = (name: string, category: RlsCategory, pub?: RlsPub): string[] => {
    if (pub === true) return []
    if (category === 'owned' || category === 'children' || category === 'file' || category === 'singleton') {
      if (typeof pub === 'string') return [rlsWherePubOrSender(name, pub, RLS_COL.userId)]
      return [rlsWhereSender(name, RLS_COL.userId)]
    }
    if (category === 'orgScoped') {
      const rules = [rlsJoinWhereSender(name, RLS_TBL.orgMember, RLS_COL.orgId)]
      if (typeof pub === 'string') rules.push(rlsWherePub(name, pub))
      return rules
    }
    return []
  }
export type { RlsCategory, RlsPub }
export { RLS_COL, RLS_TBL, rlsChildSql, rlsJoinWhereSender, rlsSql, rlsWherePub, rlsWhereSender }
