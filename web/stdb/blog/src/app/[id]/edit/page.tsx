'use client'
import { tables } from '@a/be-spacetimedb/spacetimedb'
import { parseId } from '@a/fe/utils'
import { Spinner } from '@a/ui/spinner'
import { useParams } from 'next/navigation'
import { useTable } from 'spacetimedb/react'
import { Client } from './client'
const Page = () => {
  const { id: raw } = useParams<{ id: string }>(),
    id = parseId(raw),
    [blogs, isReady] = useTable(tables.blog)
  if (!isReady)
    return (
      <div className='flex min-h-40 items-center justify-center'>
        <Spinner />
      </div>
    )
  return <Client blog={id === null ? null : (blogs.find(b => b.id === id) ?? null)} />
}
export default Page
