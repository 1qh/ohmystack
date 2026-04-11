/* eslint-disable @next/next/no-img-element */
/* oxlint-disable @next/next/no-img-element */
// biome-ignore-all lint/performance/noImgElement: x
'use client'
import type { Blog } from '@a/be-spacetimedb/spacetimedb/types'
import { tables } from '@a/be-spacetimedb/spacetimedb'
import { resolveFileUrl } from '@noboil/spacetimedb/react'
import Link from 'next/link'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'
import { Author } from '../common'
const Client = ({ blog }: { blog: Blog | null }) => {
  const { identity } = useSpacetimeDB()
  const [files] = useTable(tables.file)
  if (!blog)
    return (
      <p className='text-muted-foreground' data-testid='blog-not-found'>
        Blog not found
      </p>
    )
  if (!((identity && blog.userId.isEqual(identity)) || blog.published))
    return (
      <p className='text-muted-foreground' data-testid='blog-not-published'>
        Blog not published
      </p>
    )
  return (
    <div data-testid='blog-detail-page'>
      <Author {...blog} />
      {blog.coverImage ? (
        <img
          alt=''
          className='mt-3 w-full rounded-lg object-cover'
          data-testid='blog-detail-cover'
          height={1000}
          src={resolveFileUrl(files as never, blog.coverImage) ?? blog.coverImage}
          width={1000}
        />
      ) : null}
      <p className='mt-2 text-3xl font-bold' data-testid='blog-detail-title'>
        {blog.title}
      </p>
      <p className='whitespace-pre-line' data-testid='blog-detail-content'>
        {blog.content.trim()}
      </p>
      <div className='flex flex-col' data-testid='blog-detail-attachments'>
        {blog.attachments?.map(url => (
          <Link
            className='hover:text-blue-500 hover:underline'
            href={url}
            key={url}
            rel='noopener noreferrer'
            target='_blank'>
            {url}
          </Link>
        ))}
      </div>
    </div>
  )
}
export default Client
