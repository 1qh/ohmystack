/* eslint-disable @next/next/no-img-element */
/* oxlint-disable @next/next/no-img-element */
// biome-ignore-all lint/performance/noImgElement: x
'use client'
import type { Blog } from '@a/be-spacetimedb/spacetimedb/types'
import Link from 'next/link'
import { useResolveFileUrl } from 'noboil/spacetimedb/react'
import { useSpacetimeDB } from 'spacetimedb/react'
import { Author } from '../common'
const Client = ({ blog }: { blog: Blog | null }) => {
  const { identity } = useSpacetimeDB()
  const resolvedCover = useResolveFileUrl(blog?.coverImage)
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
      {resolvedCover ? (
        <img
          alt=''
          className='mt-3 w-full rounded-lg object-cover'
          data-testid='blog-detail-cover'
          height={1000}
          src={resolvedCover}
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
            className='hover:text-primary hover:underline'
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
