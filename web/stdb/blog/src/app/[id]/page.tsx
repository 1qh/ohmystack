'use client'
import { tables } from '@a/be-spacetimedb/spacetimedb'
import { parseId } from '@a/fe/utils'
import { Spinner } from '@a/ui/spinner'
import { useParams } from 'next/navigation'
import { useTable } from 'spacetimedb/react'
import Client from './client'
const Page = () => {
  const { id: raw } = useParams<{ id: string }>()
  const id = parseId(raw)
  const [blogs] = useTable(tables.blog)
  const blog = id === null ? null : (blogs.find(b => b.id === id) ?? null)
  if (!blog && blogs.length === 0)
    return (
      <div className='flex min-h-40 items-center justify-center'>
        <Spinner />
      </div>
    )
  return <Client blog={blog} />
}
export default Page
