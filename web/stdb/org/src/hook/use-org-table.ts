'use client'
import { useMemo } from 'react'
import { useTable } from 'spacetimedb/react'
import { useOrg } from '~/hook/use-org'
interface OrgRow {
  orgId: number
}
const useOrgTable = <T extends OrgRow>(table: Parameters<typeof useTable>[0]): readonly [T[], boolean] => {
  const { org } = useOrg(),
    [rows, isReady] = useTable(table),
    numericId = Number(org._id),
    filtered = useMemo(() => {
      const result: T[] = []
      for (const r of rows) if ((r as OrgRow).orgId === numericId) result.push(r as T)
      return result
    }, [rows, numericId])
  return [filtered, isReady] as const
}
export { useOrgTable }
