'use client'

import { tables } from '@a/be-spacetimedb/spacetimedb'
import { parseId } from '@a/fe/utils'
import { useParams } from 'next/navigation'
import { useTable } from 'spacetimedb/react'

import Client from './client'

const Page = () => {
  const { id: raw } = useParams<{ id: string }>(),
    id = parseId(raw),
    [blogs] = useTable(tables.blog)
  return <Client blog={id === null ? null : (blogs.find(b => b.id === id) ?? null)} />
}

export default Page
