'use client'
import { useMemo } from 'react'
import { useTable } from 'spacetimedb/react'
import { useOrg } from '~/hook/use-org'
interface OrgRow {
  orgId: number
}
const useOrgTable = <T extends OrgRow>(table: Parameters<typeof useTable>[0]): readonly [T[], boolean] => {
  const { org } = useOrg()
  const [rows, isReady] = useTable(table)
  const numericId = Number(org._id)
  const filtered = useMemo(() => {
    const result: T[] = []
    for (const r of rows) if ((r as OrgRow).orgId === numericId) result.push(r as T)
    return result
  }, [rows, numericId])
  return [filtered, isReady] as const
}
export { useOrgTable }
