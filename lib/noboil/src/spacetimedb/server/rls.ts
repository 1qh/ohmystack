type RlsCategory = 'base' | 'children' | 'file' | 'kv' | 'log' | 'org' | 'orgScoped' | 'owned' | 'quota' | 'singleton'
type RlsPub = boolean | string | undefined
const RLS_COL = { orgId: 'orgId', userId: 'userId' } as const
const RLS_TBL = { orgMember: 'orgMember' } as const
const q = (tbl: string, col: string): string => `"${tbl}"."${col}"`
const rlsSelect = (tbl: string): string => `SELECT * FROM "${tbl}"`
const rlsSelectJoin = (tbl: string, joinTbl: string, onCol: string): string =>
  `SELECT "${tbl}".* FROM "${tbl}" JOIN "${joinTbl}" ON ${q(tbl, onCol)} = ${q(joinTbl, onCol)}`
const rlsWhereSender = (tbl: string, col: string): string => `${rlsSelect(tbl)} WHERE ${q(tbl, col)} = :sender`
const rlsWherePubOrSender = (tbl: string, pubCol: string, senderCol: string): string =>
  `${rlsSelect(tbl)} WHERE ${q(tbl, pubCol)} = true OR ${q(tbl, senderCol)} = :sender`
const rlsJoinWhereSender = (tbl: string, joinTbl: string, onCol: string): string =>
  `${rlsSelectJoin(tbl, joinTbl, onCol)} WHERE ${q(joinTbl, RLS_COL.userId)} = :sender`
const rlsWherePub = (tbl: string, pubCol: string): string => `${rlsSelect(tbl)} WHERE ${q(tbl, pubCol)} = true`
const rlsChildSql = ({ name, parentPub }: { fk: string; name: string; parent: string; parentPub?: RlsPub }): string[] => {
  if (parentPub === true) return []
  return [rlsWhereSender(name, RLS_COL.userId)]
}
const rlsSql = (name: string, category: RlsCategory, pub?: RlsPub): string[] => {
  if (pub === true) return []
  if (category === 'owned' || category === 'children' || category === 'file' || category === 'singleton') {
    if (typeof pub === 'string') return [rlsWherePubOrSender(name, pub, RLS_COL.userId)]
    return [rlsWhereSender(name, RLS_COL.userId)]
  }
  if (category === 'orgScoped') return []
  if (category === 'log') return [rlsWhereSender(name, RLS_COL.userId)]
  if (category === 'kv') return [rlsSelect(name)]
  return []
}
export type { RlsCategory, RlsPub }
export { RLS_COL, RLS_TBL, rlsChildSql, rlsJoinWhereSender, rlsSql, rlsWherePub, rlsWhereSender }
