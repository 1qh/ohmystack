'use client'
import type { OrgProfile } from '@a/be-spacetimedb/spacetimedb/types'
import { tables } from '@a/be-spacetimedb/spacetimedb'
import { useMemo } from 'react'
import { useTable } from 'spacetimedb/react'
const useProfileMap = () => {
  const [profiles] = useTable(tables.orgProfile)
  return useMemo(() => {
    const map = new Map<string, OrgProfile>()
    for (const p of profiles) map.set(p.userId.toHexString(), p)
    return map
  }, [profiles])
}
export { useProfileMap }
