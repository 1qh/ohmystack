import type { Id } from '@a/be-convex/model'
import { api } from '@a/be-convex'
import { isId } from '@a/fe/utils'
import { preloadQuery } from 'convex/nextjs'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { getToken } from 'noboil/convex/next'
import Client from './client'
const Page = async ({ params }: { params: Promise<{ id: Id<'poll'> }> }) => {
  await connection()
  const { id: raw } = await params
  const id = isId<'poll'>(raw) ? raw : null
  if (!id) return notFound()
  const preloaded = await preloadQuery(api.poll.read, { id }, { token: await getToken() })
  return <Client preloaded={preloaded} />
}
export default Page
